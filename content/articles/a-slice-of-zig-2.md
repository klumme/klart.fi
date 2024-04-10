---
title: A Slice of Zig, Part 2
created_at: 2024-04-10
kind: article
---

In [A Slice of Zig, Part 1](/articles/a-slice-of-zig-1), we started on a tour of Zig, examining the language by looking at the implementation of ArrayList in the standard library — a "vertical slice", if you will. We covered how initialization and deinitialization of the ArrayList is implemented, but didn't go into how the actual list operations work. This article continues where the previous one left off, examining how the ArrayList is actually used and how that usage is implemented behind the scenes.

As in the previous article, the aim here is not to explain every part of the Zig language encountered or to teach you Zig from the bottom up; rather, it's to provide an overview of Zig, pointing out some of its unique features and showing some examples of how the language constructs come together in real-world code.

This article assumes you've read the first part.

note:The Zig version I used to run these examples is `0.12.0-dev.2631+3069669bc` and the ArrayList code they're based on [can be found here](https://github.com/ziglang/zig/blob/955fd65cb1705d8279eb195bdbc69810df1b1d98/lib/std/array_list.zig).

I've done some minimal changes to the code in this article to make it easier to read and to remove things that are irrelevant for the use cases discussed.endnote

---

## Using ArrayList

Here's a test (put together from a few different tests in the `array_list.zig` file) exercising the two ArrayList operations we'll examine in this article:

~~~ zig
test "basic functionality" {
    var list = ArrayList(i32).init(testing.allocator);
    defer list.deinit();

    for (0..10) |i| {
        list.append(@as(i32, @intCast(i + 1))) catch unreachable;
    }

    for (0..10) |i| {
        try testing.expect(list.items[i] == @as(i32, @intCast(i + 1)));
    }

    try list.insert(0, 4);
    try list.insert(1, 3);
    try list.insert(0, 5);
    try testing.expect(list.items[0] == 5);
    try testing.expect(list.items[1] == 4);
    try testing.expect(list.items[2] == 3);
}
~~~

We covered the ArrayList initialization and deinitialization in the first article. Now, we get to start using the list! After setting up the list, the test appends elements to it in a `for` loop. Let's take a closer look:

~~~ zig
for (0..10) |i| {
    list.append(@as(i32, @intCast(i + 1))) catch unreachable;
}
~~~

At first glance, we loop over a range of numbers, appending each number plus one to the list. There are some interesting things going on here: `for` loops in Zig iterate over arrays and slices, though you can also use the range syntax to iterate over consecutive integers, as we do he here. The current element in the range (which goes from 0 up to but not including 10) is captured as `i` inside the block.

What about the `@as(i32, @intCast(i + 1))` part? This is about casting the index captured by the `for` loop, which is of type `usize`, to the `i32` type. The built-in function `@as` will convert to a given type *provided it is safe to do so*. We know that `i` will only have values from 0 to 9 and so casting `i + 1` to `i32` is always going to work. The compiler, however, sees us casting an unsigned 64-bit integer to a signed 32-bit integer and suspects trouble. Therefore, we must add the call to `@intCast`, which *does not* ensure the conversion is safe to do. `@intCast` determines the type to cast to — here, `i32` — through type inference. In fact, leaving out the  outer call to `@as` seems to work just as well, as the type of the `@intCast(i + 1)` expression is determined by the call to `ArrayList(i32).append`.

The final piece of the puzzle is `catch unreachable` at the end of the line. This brings us to error handling in Zig. Again, we won't cover this topic in great detail, but the basics will suffice to explain the code we encounter in this article. The return type of the ArrayList `append` method is `Allocator.Error!void`. This is an *error union type* — a type that holds either an error (here: `Allocator.Error`) or a value (here, of type `void` — nothing). In short, the method returns an error or nothing. We can't just ignore the potential error, as Zig makes sure errors are *always handled*. This can be done in a variety of ways: we can check if the method returned an error and take appropriate action, we can pass the error up the chain, and so on. The `catch` operator lets us specify an alternative value to use in case the expression before `catch` evaluates to an error. However, here, we're really not expecting an error to occur, so we provide `unreachable` as the alternative value. This is a value that will cause a runtime panic or undefined behaviour depending on the build mode of the application if execution ever reaches it. `catch unreachable` is a common pattern; a way of saying "we don't expect errors to occur here in the circumstances we care about" (and that if they do, the program should crash).

Moving on to the next part of the test:

~~~ zig
for (0..10) |i| {
    try testing.expect(list.items[i] == @as(i32, @intCast(i + 1)));
}
~~~

We've appended ten elements to the list, now we check that they're there. The loop and the integer cast are as before; two elements of this code snippet stand out though. First, we access list element number *i* by `list.items[i]`. As we saw in the previous article, `list.items` is a slice pointing at the actual elements of the list. There's no special method for indexing into the list; instead, we access the `items` slice directly.

Second, there's the `try testing.expect( ... )` part, where `try` is related to error handling. The return type of `testing.expect` is `!void`. This is an error union type as well: one that holds either `void` or an error from an *inferred* set of errors: Zig can usually figure out which errors a function can return, and so inferred error sets are often used. I mentioned above that there are several different ways to handle an error and this is one of them: `try` will return the error from the current function, or unwrap the value if it isn't an error.

As you can probably guess, `testing.expect` simply checks that the expression passed to it is true, otherwise it returns an error. This error will be returned by `try`, signalling a failed test.

~~~ zig
try list.insert(0, 4);
try list.insert(1, 3);
try list.insert(0, 5);
try testing.expect(list.items[0] == 5);
try testing.expect(list.items[1] == 4);
try testing.expect(list.items[2] == 3);
~~~

These last parts of the test are straight-forward: `insert` inserts an element at a specific position in the list: the first argument is the index at which to insert it and the second is the element itself. We insert some elements into the list and check that they are where they are supposed to be.

As we've seen, the test uses two operations of the ArrayList: `append` and `insert`. In the previous article, we saw how the ArrayList is initialized and deinitialized, but left out what happens in between. We also noted that the list initially had capacity 0, which means we'll have to allocate memory as soon as we add the first element to the list. As we take a look at how `append` and `insert` are implemented, we'll learn how that works!

---

## Append

Appending to the list is the more simple operation. Intuitively, if the list already has enough memory allocated, we can just drop the new element after the previous ones in memory (along with some housekeeping to track the length of the list). If the list is already using all its memory, we have to allocate more. Here's the definition of `append`:

~~~ zig
/// Extends the list by 1 element. Allocates more memory as necessary.
/// Invalidates element pointers if additional memory is needed.
pub fn append(self: *Self, item: T) Allocator.Error!void {
    const new_item_ptr = try self.addOne();
    new_item_ptr.* = item;
}
~~~

The comment notes that this method "invalidates element pointers if additional memory is needed". Remember that the list holds it elements in the memory pointed to by `items`. We can, of course, have a pointer to one of these elements. However, if we append an element to the list and end up having to allocate more memory, we might have to copy all our elements somewhere else in memory and free the old memory. The old element pointer is now invalid. You'll see many such comments in the Zig standard library noting which methods have the potential of invalidating pointers.

In the previous article, I mentioned that calling something like `list.operation()` is the same as calling (for example) `ArrayList(i32).operation(list)`. However, here we see `append` taking a *pointer* as the `self` parameter, even though we called `list.append` normally in the test. Zig will handle this automatically, providing the method with a value or a pointer as needed. The reason for using a pointer is that `append` needs to modify `self`, and all parameters are immutable in Zig. As we saw when calling it from the test, the method returns `Allocator.Error!void` — an error union type holding either `Allocator.Error` or nothing. The test handled this error using `catch unreachable`. When we initialized the ArrayList, we passed in an allocator for it to use for memory allocation. The potential error returned from `append` comes from this allocator.

The `append` method itself is short. It calls `self.addOne`, which makes place in the list for one additional element, without setting that element to anything. It also returns a pointer to the new element. On the next line, that pointer is used: `.*` is the *pointer dereference* operator in Zig so `new_item_ptr.* = item` sets the data pointed to by `new_item_ptr` to the element we want to add to the list. Again, you see `try` used when calling `addOne` — as mentioned, this means that if the method returns an error, we return it from the current method, passing it up the chain.

The `append` method needs to make sure there's enough memory in the list for an additional element, allocating more memory if needed. It also needs to update the length of the list, to make the list "aware" it's now holding an extra element. This is handled by the `addOne` method.

### The addOne method

~~~ zig
/// Increase length by 1, returning pointer to the new item.
/// The returned pointer becomes invalid when the list resized.
pub fn addOne(self: *Self) Allocator.Error!*T {
    // This can never overflow because `self.items` can never occupy the whole address space
    const newlen = self.items.len + 1;
    try self.ensureTotalCapacity(newlen);
    return self.addOneAssumeCapacity();
}
~~~

As with `append`, there's a comment noting when the returned pointer becomes invalid. The `addOne` method returns `Allocator.Error!*T` — an allocator error or a pointer to `T`. As you might recall, `T` is the type of the elements in our list. In the method, we calculate the new length of the list by adding one to the length of `self.items`, which is the slice holding the list elements. My understanding of the comment about how the addition can never overflow is this: the type of `self.items.len` is `usize`, a type which needs to be able to address *all* memory. For the addition to overflow, `usize` would have to have its maximum value already, which means `self.items` would have to occupy at least all memory available. However, this can't be the case, as a having an ArrayList means there are other things in memory as well.

Again, `addOne` is a short method. It uses a couple of other methods to handle most of its task. The method `ensureTotalCapacity` is used to make sure the list has capacity for the new number of elements (the previous number of elements plus one), while `addOneAssumeCapacity` then increases the length of the list and returns a pointer to the new element.

### The ensureTotalCapacity method

~~~ zig
/// If the current capacity is less than `new_capacity`, this function will
/// modify the array so that it can hold at least `new_capacity` items.
/// Invalidates element pointers if additional memory is needed.
pub fn ensureTotalCapacity(self: *Self, new_capacity: usize) Allocator.Error!void {
    if (@sizeOf(T) == 0) {
        self.capacity = math.maxInt(usize);
        return;
    }

    if (self.capacity >= new_capacity) return;

    const better_capacity = growCapacity(self.capacity, new_capacity);
    return self.ensureTotalCapacityPrecise(better_capacity);
}
~~~

This method makes sure that the list has *at least* the specified capacity. It starts with a check of a type we've seen before: if the size of `T` is 0, the list can store as many items as an `usize` can count, without any memory needed for the items. We then check if the list capacity is already large enough, in which case we don't need to do anything here. If the capacity needs to be increased, `growCapacity` is called to get a suitable new capacity for the list, at least as large as the new capacity needed. This method just does a small calculation to grow memory in an efficient way and returns the exact new capacity to aim for. Then, `ensureTotalCapacityPrecise` is called with that capacity to actually grow the list capacity.

### The ensureTotalCapacityPrecise method

~~~ zig
/// If the current capacity is less than `new_capacity`, this function will
/// modify the array so that it can hold exactly `new_capacity` items.
/// Invalidates element pointers if additional memory is needed.
pub fn ensureTotalCapacityPrecise(self: *Self, new_capacity: usize) Allocator.Error!void {
    if (@sizeOf(T) == 0) {
        self.capacity = math.maxInt(usize);
        return;
    }

    if (self.capacity >= new_capacity) return;

    // Here we avoid copying allocated but unused bytes by
    // attempting a resize in place, and falling back to allocating
    // a new buffer and doing our own copy. With a realloc() call,
    // the allocator implementation would pointlessly copy our
    // extra capacity.
    const old_memory = self.allocatedSlice();
    if (self.allocator.resize(old_memory, new_capacity)) {
        self.capacity = new_capacity;
    } else {
        const new_memory = try self.allocator.alignedAlloc(T, null, new_capacity);
        @memcpy(new_memory[0..self.items.len], self.items);
        self.allocator.free(old_memory);
        self.items.ptr = new_memory.ptr;
        self.capacity = new_memory.len;
    }
}
~~~

Finally, we do some actual memory allocation! You'll see the same check for a zero-sized `T` and for a capacity that's already large enough as in `ensureTotalCapacity`. Then, the strategy is to try to increase memory *in place* and, if that fails, to allocate new memory and copy the old items there. This could be done by calling the `realloc` method of the allocator but, as the comment points out, there could be a situation where the list has capacity for more elements than it's currently holding. Calling `realloc` would result in *all* the old memory being copied over if new memory is allocated somewhere else, which is unnecessary — we just need to copy the memory actually used for list elements. Therefore, this logic is handled "manually" in the function. (This situation won't apply for the `append` method we're looking at here: if the capacity is larger than the number of items, there's already place for our additional item, and no allocation is needed... however, the `ensureTotalCapacityPrecise` method is used in many other situations as well.)

The `old_memory` constant is set to the result of calling `self.allocatedSlice()`. We saw this method in the last article — it just returns a slice to *all* memory allocated for the list. We then try to do a resize in place. If this works, there's no copying of elements needed, but if it doesn't, we move on the the `else` clause. Here, we allocate new memory using the allocator. We use the built-in `@memcpy` function to copy the old data to the new location, but only the actual list elements, not the whole capacity! We free the old memory (here's where pointers to existing items become invalid), point `self.items` at the new memory (by manipulating its `ptr` field directly — the length stays the same) and finally update the capacity of the list. We now return through `ensureTotalCapacity` to `addOne`, where, after the capacity of the list has been ensured to be sufficient, we call `addOneAssumeCapacity` to add one (undefined) element to the list.

### The `addOneAssumeCapacity` method

~~~ zig
/// Increase length by 1, returning pointer to the new item.
/// The returned pointer becomes invalid when the list is resized.
/// Never invalidates element pointers.
/// Asserts that the list can hold one additional item.
pub fn addOneAssumeCapacity(self: *Self) *T {
    assert(self.items.len < self.capacity);
    self.items.len += 1;
    return &self.items[self.items.len - 1];
}
~~~

In `addOneAssumeCapacity`, we first assert that the assumption holds: that the list indeed has capacity for one more item. (If you're interested in the reasoning behind adding assertions to your code, go watch [this incredible presentation](https://www.youtube.com/watch?v=sC1B3d9C_sI) of the TigerBeetle financial transactions database written in Zig: in short, as you write code, you have some implicit assumptions in your head about what is going on. Assertions can serve to make these assumptions explicit, communicating them to others reading the code, and, of course, making any violations obvious, as the application will crash.) Then we manipulate the `len` field of `self.items` directly, as we know the memory is available for it to hold at least one more item. We return the address of this extra item (still not set to anything) to `addOne`, which returns it to `append` which, as we've seen, uses this address to actually write the element being appended to that memory location. With that, we've followed the functionality of `append` all the way through the ArrayList code!

---

## Insert

Let's look at the code using `insert` from our earlier test:

~~~ zig
try list.insert(0, 4);
try list.insert(1, 3);
try list.insert(0, 5);
try testing.expect(list.items[0] == 5);
try testing.expect(list.items[1] == 4);
try testing.expect(list.items[2] == 3);
~~~

As mentioned, `insert` takes an index and an element and inserts the element at the specificed index in the list, moving any following elements of the list further back. You can imagine how this works in a similar way to `append`, in that we have to make space in the list for one more element than it currently holds, get a pointer to that element and set it. However, here we have the added complication of having to move any elements following the inserted one to make space for it. Let's look at the definition of `insert`:

~~~ zig
/// Insert `item` at index `i`. Moves `list[i .. list.len]` to higher indices to make room.
/// If `i` is equal to the length of the list this operation is equivalent to append.
/// This operation is O(N).
/// Invalidates element pointers if additional memory is needed.
/// Asserts that the index is in bounds or equal to the length.
pub fn insert(self: *Self, i: usize, item: T) Allocator.Error!void {
    const dst = try self.addManyAt(i, 1);
    dst[0] = item;
}
~~~

The comment provides some useful info: again, calling this method can invalidate element pointers, and there will be an assertion that the index at which we're trying to insert is in bounds for the list. In `append`, we first called `addOne` to make space for the new element, then used the returned pointer to actually set it. We're doing something similar here, first calling `addManyAt` to make space for our new element, then using the returned slice to set it (one could imagine a method `addOneAt`, returning a pointer rather than a slice, but that's not how ArrayList was implemented). Let's take a look at `addManyAt`!

### The addManyAt method

~~~ zig
/// Add `count` new elements at position `index`, which have
/// `undefined` values. Returns a slice pointing to the newly allocated
/// elements, which becomes invalid after various `ArrayList`
/// operations.
/// Invalidates pre-existing pointers to elements at and after `index`.
/// Invalidates all pre-existing element pointers if capacity must be
/// increased to accomodate the new elements.
/// Asserts that the index is in bounds or equal to the length.
pub fn addManyAt(self: *Self, index: usize, count: usize) Allocator.Error![]T {
    const new_len = try addOrOom(self.items.len, count);

    if (self.capacity >= new_len)
        return addManyAtAssumeCapacity(self, index, count);

    // Here we avoid copying allocated but unused bytes by
    // attempting a resize in place, and falling back to allocating
    // a new buffer and doing our own copy. With a realloc() call,
    // the allocator implementation would pointlessly copy our
    // extra capacity.
    const new_capacity = growCapacity(self.capacity, new_len);
    const old_memory = self.allocatedSlice();
    if (self.allocator.resize(old_memory, new_capacity)) {
        self.capacity = new_capacity;
        return addManyAtAssumeCapacity(self, index, count);
    }

    // Make a new allocation, avoiding `ensureTotalCapacity` in order
    // to avoid extra memory copies.
    const new_memory = try self.allocator.alignedAlloc(T, null, new_capacity);
    const to_move = self.items[index..];
    @memcpy(new_memory[0..index], self.items[0..index]);
    @memcpy(new_memory[index + count ..][0..to_move.len], to_move);
    self.allocator.free(old_memory);
    self.items = new_memory[0..new_len];
    self.capacity = new_memory.len;
    // The inserted elements at `new_memory[index..][0..count]` have
    // already been set to `undefined` by memory allocation.
    return new_memory[index..][0..count];
}
~~~

As the comment above the method notes, `addManyAt` will inevitably invalidate pointers to elements following the inserted one, as those elements will always have to be moved. However, it might be the case that we have to allocate new memory somewhere else and copy *all* items there; in that case, all element pointers will be invalidated.

The task of `addManyAt` is to make space for a number of new elements (in our case just one) somewhere in the list, move the elements after it back, and return a slice to the place in the list where the new elements can be written. Where `addOne` called out to `ensureTotalCapacity` (which in turn called `ensureTotalCapacityPrecise`) to do the actual allocation, here, the allocation is done directly in the method. As we'll see shortly, this helps us avoid unnecessary copying of memory.

We start by calling `addOrOom` to get the new length of the list. This is a small method which adds two numbers of type `usize` and return an `OutOfMemory` error if the addition overflows: if `usize` overflows, that definitely means we're out of memory! After this, there are three main scenarios: the list already has capacity for the new elements, it doesn't have capacity but the allocated memory can be increased in place, or we have to allocate new memory somewhere else.

~~~ zig
if (self.capacity >= new_len)
    return addManyAtAssumeCapacity(self, index, count);
~~~

If the list already has capacity for the new items, we return the result of calling `addManyAtAssumeCapacity`, which we'll soon examine closer. Otherwise, we try to resize the memory in place: much like we saw in `ensureTotalCapacityPrecise` when looking at the `append` method, this and the scenario where we have to allocate new memory could be handled by a call to `realloc`, but this would cause all the old allocated memory to be copied over if we have to allocate new memory, not just the memory used by the list items. There's also another consideration which we'll cover in a little bit.

~~~ zig
const new_capacity = growCapacity(self.capacity, new_len);
const old_memory = self.allocatedSlice();
if (self.allocator.resize(old_memory, new_capacity)) {
    self.capacity = new_capacity;
    return addManyAtAssumeCapacity(self, index, count);
}
~~~

Growing the memory in place works much like we've seen before, after which we again call `addManyAtAssumeCapacity` to make space for the new elements in the list. If the memory can't be grown in place, however, we have to allocate new memory somewhere else. Here, we see another reason to avoid `realloc` (and `ensureTotalCapacity`): after allocating new memory somewhere else and copying the old list elements there, we'd still have to move the elements after the insertion to make place for the new elements. If we do the allocation directly in this method, we can move the elements back at the same time as we're copying them to the newly allocated memory, avoiding extra copying.

~~~ zig
// Make a new allocation, avoiding `ensureTotalCapacity` in order
// to avoid extra memory copies.
const new_memory = try self.allocator.alignedAlloc(T, null, new_capacity);
const to_move = self.items[index..];
@memcpy(new_memory[0..index], self.items[0..index]);
@memcpy(new_memory[index + count ..][0..to_move.len], to_move);
self.allocator.free(old_memory);
self.items = new_memory[0..new_len];
self.capacity = new_memory.len;
// The inserted elements at `new_memory[index..][0..count]` have
// already been set to `undefined` by memory allocation.
return new_memory[index..][0..count];
~~~

In short, then, after allocating the new memory, we first get a slice of all the elements *after* the index at which we'll make space for new elements. We copy the list elements up to that index directly to the newly allocated memory. Then, we copy the elements after that index, offsetting them towards the end of the list to make space in the middle for the new elements. We free the old memory and point `self.items` at the new memory. Finally, we update the list capacity to reflect the allocated memory, and return a slice pointing at the space in the middle of the list where the new elements can be written. This slice is returned to `insert`, which uses it to write the inserted element.

### The addManyAtAssumeCapacity method

In the case where we already have enough capacity in the list for the new elements, or where the memory can be grown in place, we call `addManyAtAssumeCapacity` to make space for the new elements:

~~~ zig
/// Add `count` new elements at position `index`, which have
/// `undefined` values. Returns a slice pointing to the newly allocated
/// elements, which becomes invalid after various `ArrayList`
/// operations.
/// Asserts that there is enough capacity for the new elements.
/// Invalidates pre-existing pointers to elements at and after `index`, but
/// does not invalidate any before that.
/// Asserts that the index is in bounds or equal to the length.
pub fn addManyAtAssumeCapacity(self: *Self, index: usize, count: usize) []T {
    const new_len = self.items.len + count;
    assert(self.capacity >= new_len);
    const to_move = self.items[index..];
    self.items.len = new_len;
    mem.copyBackwards(T, self.items[index + count ..], to_move);
    const result = self.items[index..][0..count];
    @memset(result, undefined);
    return result;
}
~~~

By now, this is quite familiar stuff: after asserting that we do indeed have the capacity for the added elements, this method assigns the elements that need to be moved back to a slice. It updates the length of `self.items` to take into account the new elements we're adding, copies the elements that need moving into the correct position, and gets a slice to the space for the new elements. There's a call to the `@memset` built-in function to set the new elements to `undefined`, before returning them to `addManyAt`, which returns the slice to `insert`, which uses the slice to set the inserted element.

Why are we using `mem.copyBackwards` here instead of `@memcpy`? With `@memcpy`, the source and destination ranges for the copy are not allowed to overlap. In our case, the ranges *can* overlap: if we insert one element, with five elements following it in the list, the source and destination ranges will overlap by four elements. The `mem.copyBackwards` function starts copying from the *end* of the range which avoids overwriting later elements in the source range; if we wanted to move a range of elements towards the *head* of the list, we could use `mem.copyForwards` instead.

---

## Conclusion

In this article, we've looked at how appending and inserting elements works in the Zig ArrayList. While we've covered a lot of ground, there are common list operations we haven't examined at all, like removing elements from the list. Still, if you have a handle on the concepts covered so far, you're quite capable of looking at the source code for those operations and figuring out how they work!

### Exercise

[At the end of the last article](/articles/a-slice-of-zig-1/#exercise), I suggested implementing your own simple list as a way to acquire a better understanding of these concepts. The exercise described a generic list backed by a fixed-size array, with methods for appending and for retrieving the item at a specific index. After having seen how the ArrayList manages memory, we can extend our requirements and make our list size dynamic:

- Make the list take an allocator in an `init` method, storing it in a field (in the previous article, we looked at how ArrayList does this)
  - Update the old tests to pass the allocator to the list (use `std.testing.allocator` to catch memory leaks)
- Make the list backed by dynamically allocated memory, rather than a static array
- Add a `deinit` method to free the list memory
- Change the `append` method to allocate new memory (freeing the old) when required
- You probably want the `append` method to return an error union type, as allocation might fail
  - This also requires updating the calls to `append` in your tests; you can use `try`, for example
- Add an `insert` method for inserting an element at a specific index, moving elements after it back
- Add a test for the `insert` method

Again, here's a simple implementation of the exercise:

hidden:
~~~ zig
const std = @import("std");
const expect = std.testing.expect;
const expectEqual = std.testing.expectEqual;

fn MyList(T: type) type {
    return struct {
        const Self = @This();

        items: []T,
        capacity: usize,
        allocator: std.mem.Allocator,

        pub fn init(allocator: std.mem.Allocator) Self {
            return .{
                .items = &[_]T{},
                .capacity = 0,
                .allocator = allocator,
            };
        }

        pub fn deinit(self: Self) void {
            self.allocator.free(self.items[0..self.capacity]);
        }

        pub fn append(self: *Self, item: T) !void {
            try self.growCapacityIfNecessary();
            self.items.len += 1;
            self.items[self.items.len - 1] = item;
        }

        pub fn insert(self: *Self, index: usize, item: T) !void {
            try self.growCapacityIfNecessary();
            self.items.len += 1;
            std.mem.copyBackwards(T, self.items[index + 1 .. self.items.len], self.items[index .. self.items.len - 1]);
            self.items[index] = item;
        }

        pub fn get(self: *const Self, index: usize) T {
            return self.items[index];
        }

        fn growCapacityIfNecessary(self: *Self) !void {
            if (self.capacity <= self.items.len) {
                // Allocating every time an item is added is inefficient; in the
                // real world, we'd want to allocate a larger chunk of memory
                const new = try self.allocator.alloc(T, self.items.len + 1);
                @memcpy(new[0..self.items.len], self.items);
                self.allocator.free(self.items[0..self.capacity]);
                self.items.ptr = new.ptr;
                self.capacity += 1;
            }
        }
    };
}

test "append method" {
    var list = MyList(i32).init(std.testing.allocator);
    defer list.deinit();

    try list.append(5);
    try list.append(42);
    try list.append(20_000);

    try expectEqual(5, try list.get(0));
    try expectEqual(42, try list.get(1));
    try expectEqual(20_000, try list.get(2));
}

test "list holding struct" {
    const Point = struct {
        x: i32,
        y: i32,
    };

    var list = MyList(Point).init(std.testing.allocator);
    defer list.deinit();

    try list.append(.{ .x = 100, .y = 200 });
    try list.append(.{ .x = 150, .y = 300 });

    try expectEqual(300, (try list.get(1)).y);
}

test "insert method" {
    var list = MyList(u8).init(std.testing.allocator);
    defer list.deinit();

    try list.append('Z');
    try list.append('g');
    try list.insert(1, 'i');

    try expect(std.mem.eql(u8, "Zig", list.items));
}
~~~
endhidden

That's all for the moment, hope you enjoyed the article! Thanks for reading!
