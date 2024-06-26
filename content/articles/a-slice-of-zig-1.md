---
title: A Slice of Zig, Part 1
created_at: 2024-03-02
kind: article
---

Lately, I've been playing around with the [Zig programming language](https://ziglang.org/). Zig is a general-purpose programming language, heavily inspired by C, but with many of the possible ways of shooting yourself in the foot removed. If you want to know more about the goals of Zig, along with its similarities to and differences from C, there are [many](https://ziglang.org/learn/overview/) [resources](https://ziglang.org/learn/why_zig_rust_d_cpp/) [available](https://www.youtube.com/watch?v=gn3YsZ6HUHw).

The purpose of this article is to give you a quick tour of some production Zig code, taken from the Zig standard library. It's aimed at someone who does programming and who knows about concepts like pointers, the stack and the heap, but perhaps without much experience using these concepts in actual programs. As opposed to a language tour from the bottom up, I want to show how these concepts come together in real life.

note:The code examples in this article are taken from the Zig standard library, but they've been modified. I've removed some layers of indirection and some code irrelevant for the features covered, and slightly changed some parts to make them clearer. What I *haven't* done is change the functionality of the code shown, or dumbed down the examples. Excepting mistakes on my part, the code shown corresponds to what the Zig standard library actually does.

Zig is under rapid development, and does not yet aim for stability. The Zig version I used to run these examples is `0.12.0-dev.2631+3069669bc` and I link to the specific version of the standard library code referred to below.endnote

---

## ArrayList

The focus of our investigation is the ArrayList. Other languages might call this a list or an array: a structure holding multiple items of the same type in a specific order, with the ability to grow or shrink as necessary at runtime. The Zig language does have a built-in array, but this is similar to C arrays in that it's static: its size must be known at compile time, and, once the array is declared, the size cannot change. In practice, there are many cases where you don't know the number of items in advance or where the number changes during execution of the program: this is where the ArrayList from the Zig standard library comes in.

The code for the Zig standard library can be found in the [Zig GitHub repository](https://github.com/ziglang/zig/), in the `lib/std` directory. The ArrayList is defined in the file [`array_list.zig`](https://github.com/ziglang/zig/blob/955fd65cb1705d8279eb195bdbc69810df1b1d98/lib/std/array_list.zig). Looking at this file, towards the bottom we find some tests for the ArrayList. Zig allows you to add tests in the same file as the code for your executable or library. Not only do the tests make sure that the code is working, but they also *demonstrate usage* of the thing they are testing. In other words, tests can often serve as a helpful supplement to documentation. We'll use these tests as a starting point for our Zig tour.

Tests are run using the `zig test` command, or by the Zig build system. Running the tests yourself is very easy: download the [`array_list.zig`](https://github.com/ziglang/zig/blob/955fd65cb1705d8279eb195bdbc69810df1b1d98/lib/std/array_list.zig) file from GitHub and change the reference to `"std.zig"` on the first line to just `"std"`. Then, assuming you have a compatible Zig version installed, run `zig test array_list.zig` and you should get output indicating the number of tests that passed. Playing around with the code is just as simple: change something in the implementation or add some tests, then run `zig test array_list.zig` and watch what happens!

---

## A test for ArrayList

Let's move on to some code! Here's an example of an ArrayList test:

~~~ zig
test "basic functionality" {
    var list = ArrayList(i32).init(std.testing.allocator);
    defer list.deinit();

    // ... exercise the list and test that the results are correct
}
~~~

Here, the `test` declaration has a short description of the test followed by a block containing the code actually performing the test. We won't go into detail of how the test runner works but instead move on to the code dealing with the ArrayList itself. The two first lines inside the block handle initializing and deinitializing the list, after which there's code (omitted here) to add items to the list, retrieve items from it, and make sure the results are as expected.

note:As I was writing this article, I found that just dealing with the initialization and deinitialization of the list provided plenty of material for one article. [In the next part](/articles/a-slice-of-zig-2), we look at how the list is actually used and how that usage is implemented.endnote

Looking at the first two lines inside the block, you might be able to guess what's going on, even if you're fuzzy on the details: it looks like we're initializing an ArrayList meant to hold signed 32-bit integers, passing it something called an allocator. We then set it up to be deinitialized later.

### Types as values

The first thing to realize here is that `ArrayList` is just a normal function, returning a type. In Zig, the names of non-primitive types are usually written in PascalCase, and so the name of a function returning a type is in PascalCase as well. We also pass a type *to* the function — `i32` is the type of a signed 32-bit integer.

If you started programming in an imperative style and, at some point, veered of into a more functional direction, you may have found it novel that *functions* could be passed around just like any other value. In Zig, we get to have the same epiphany with *types*. Types are first-class values and can be passed to functions, returned from functions, stored in variables and more. This is one way to do generics in Zig: types are passed around as values and can then be used to declare the proper kind of structure, run the appropriate function, or so on. This will become clearer as we start looking at the ArrayList implementation!

The other thing to note is that types are only handled at compile-time. Where C has the preprocessor to run code at compile-time and do metaprogramming, and other languages have macros for the same purpose, Zig has `comptime`. In short, this is a way to run arbitrary Zig code at and only at the point when your program is getting compiled, rather than when it's executed. `comptime` is a very powerful concept, but not something I'll go into in depth in this article. For now, suffice to say that the type values we pass around must be known at compile-time.

### Memory allocation

~~~ zig
var list = ArrayList(i32).init(std.testing.allocator);
~~~

We call the `ArrayList` function, passing it the `i32` type, which is the type of items we want the list to hold. As I mentioned, `ArrayList` *returns* another type — the type of ArrayLists holding signed 32-bit integers. On this type, we call the method `init`, passing in something called `std.testing.allocator`.

This brings us to how dynamic memory is managed in Zig. In C, you allocate heap memory using `malloc` and related functions. There are also standard library functions that use `malloc` internally. In a more high-level language, simply declaring a type such as a list may result in memory being allocated. In Zig, the language and standard library do not allocate heap memory behind your back, and there's no default allocator. When a function or type needs to use dynamic memory, as is the case with the ArrayList, this is made explicit by that function taking an allocator as a parameter. By convention, this is the strategy used by third-party libraries as well.

In addition to making dynamic memory allocation explicit, this allows the programmer to choose the memory management strategy — and to choose different strategies for different parts of a program. For some parts of the program, it might make sense to free all heap memory allocated in that part at the same time, while other parts of the program need to control memory in a more granular way. Zig comes with some allocators in its standard library, and you can also write your own!

Here, we're using the testing allocator from the standard library. This allocator is useful during development as it will actually detect and warn us about memory leaks. If you downloaded [`array_list.zig`](https://github.com/ziglang/zig/blob/955fd65cb1705d8279eb195bdbc69810df1b1d98/lib/std/array_list.zig) earlier, you can test this for yourself: go in and delete one of the `defer list.deinit()` lines in a test and run the tests again. Zig will let you know that a memory leak was detected.

~~~ zig
defer list.deinit();
~~~

Speaking of the `defer list.deinit()` line, its purpose is to make sure the `deinit` method is called on `list` at the end of the current scope. In this case, the scope ends after we reach the closing bracket of the `test` block (or after some code in the block returns early). As we'll see in more detail later, `deinit` frees the memory used by the ArrayList and so, forgetting to do so will indeed cause a memory leak. `defer` is handy as it lets us keep the initalization and deinitialization of the ArrayList together in the source file, even though the deinitialization happens at the end of the scope. Also, `defer` makes sure deinitialization happens even if later code causes us to exit the scope with an error. This way, you can make sure memory is not leaked even when errors are encountered.

---

## ArrayList implementation

Now we move on to the `ArrayList` function itself:

~~~ zig
pub fn ArrayList(comptime T: type) type {
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
            if (@sizeOf(T) > 0) {
                self.allocator.free(self.allocatedSlice());
            }
        }

        // ...
    };
}
~~~

As mentioned, `ArrayList` is a function that takes a type as a parameter and returns another type. The type passed in, `T`, is the type of the items we want to store in our list. Inside `ArrayList`, we'll see this `T` parameter used for item storage, the return type for methods, and more.

The type returned by `ArrayList` is a *struct* type. A struct is somewhat like a class in another language (though without the whole concept of inheritance) — a blueprint for an *object*. A struct can have *fields* — the attributes of the object — but also methods and declarations. In fact, we can see examples of all of these in the struct above.

It's important to understand that what's returned from `ArrayList` is not an *instance* of a struct but a struct *type* — like the type of a list holding signed 32-bit integers. As we saw in the test code, the `init` method is then called on this type to get an *instance* of it.

### Struct fields

~~~ zig
return struct {
    const Self = @This();
    items: []T,
    capacity: usize,
    allocator: std.mem.Allocator,

    // ...
};
~~~
Let's look closer at the struct returned. First, there's a declaration: `Self` is set to the struct type itself, using the built-in function `@This`. This may sound complicated, but is just a convenient way to refer to the `ArrayList(T)` type itself — as the return type for `init`, for example.

The first field of our struct is `items`. This holds the actual items (of type `T`) of our list. It is a *slice* of `T`. A slice in Zig is essentially a combination of a pointer and a length. It usually points into some memory managed elsewhere, and spans a certain number of items. For example, "strings" in Zig are often slices of bytes, and if you had a string representing a URL you could then have a slice (pointer and length) pointing into this representing the host part. Having the length available is very useful, as you don't have to jump through hoops to figure out how far ahead from a particular pointer you're supposed to read. When I say that `items` holds the items of our list, I mean that there's some memory allocated for these items and `items` has a pointer to this memory, along with a length telling us how many items there are.

The `capacity` field keeps track of how many items the list *can* currently hold — the amount of memory allocated it. This is as opposed to how many items the list currently *holds*, which is the same as the length of our `items` slice — `items.len`. The reason for the capacity often being larger than the number of items held is that memory allocation is expensive; once we go to the trouble of allocating more memory, we allocate more than we need so that we won't have to do it again for a while.

The last struct field is `allocator`, which holds the allocator passed into `init`. The same allocator is used to resize the list and, when the list is deinitialized, to free its memory. The type of this field is `std.mem.Allocator`, while the value stored will be some particular allocator implementation. Zig doesn't have interfaces as an explicit language feature but there are [ways of implementing them](https://www.openmymind.net/Zig-Interfaces/) — these, however, are outside the scope of this article.

### Initializing the struct

~~~ zig
return struct {
    // ...

    pub fn init(allocator: std.mem.Allocator) Self {
        return .{
            .items = &[_]T{},
            .capacity = 0,
            .allocator = allocator,
        };
    }

    // ...
};
~~~
We then have our first struct *method*, `init` (marked `pub` to be usable from outside the struct). Methods are not special, they are just functions namespaced inside a struct. We do get some syntactic sugar when it comes to calling methods on struct instances, as we'll see when looking at the `deinit` method.

`init` takes an allocator and returns `Self` — our alias for the struct type returned from `ArrayList`. It returns an instance of that type — here, using an anonymous struct literal, as Zig can infer the type of the struct from the return type of the function. The capacity of the struct instance is set to 0, which means we'll have to allocate memory as soon as we add the first item to the list. The allocator field holds the allocator passed into `init`. The initial value of the `items` field warrants a closer look.

Recall that `items` is a slice of `T` — a pointer into some memory holding items, along with a length representing the number of items held. Zig has static arrays which are expressed like this: `[3]i32{ 1, 2, 3 }` is an array of three signed 32-bit integers; the values 1, 2 and 3. The length of an array can be inferred: `[_]i32{ 1, 2, 3 }`. The initial value of `items`, then, is a pointer to `[_]T{}` — an empty array of `T`. A pointer to an array coerces to a slice, so this works fine. This means `items` points at an empty array initially, but once we add items to the list, we'll make sure to actually allocate some memory.

### Deinitializing the struct

Reiterating, back in the test we called `ArrayList(i32)` and got back a type representing a list holding integers. We then called `init(std.testing.allocator)` on this, getting back an *instance* of that type. We can now use this list: add items to it, retrieve items, remove them and so on. The next article covers this usage. For now, let's see how the list is *deinitialized*. This happens through the `defer list.deinit()` line in the test.

~~~ zig
return struct {
    // ...

    pub fn deinit(self: Self) void {
        if (@sizeOf(T) > 0) {
            self.allocator.free(self.allocatedSlice());
        }
    }

    // ...
};
~~~
The `deinit` method takes a parameter of type `Self` and returns `void` — nothing. As we saw earlier, `Self` is an alias for the struct type returned from `ArrayList`. Here, we see the syntactic sugar for methods mentioned earlier: while we could call this method using `ArrayList(i32).deinit(list)`, we can also use `list.deinit()`, with `list` getting automatically assigned to the `self` parameter. The `self` parameter is not special, it could have any name.

First, the built-in function `@sizeOf` is used to see if the item type has a size larger than zero bytes. My understanding of this is that we could potentially use the list to store a type with no size, like `void`, and then we could actually store items in the list without allocating memory, as `items.len` would give us all the information we need. In any case, we then refer to the allocator field of the struct instance passed in as `self` to free the memory allocated for the list. This memory is returned from the method `allocatedSlice` — let's take a look at this method (which is inside the struct returned from `ArrayList`, just like the `init` and `deinit` methods):

~~~ zig
return struct {
    // ...

    pub fn allocatedSlice(self: Self) []T {
        return self.items.ptr[0..self.capacity];
    }

    // ...
};
~~~

This method also takes a `self` parameter, and it returns a slice of `T`. This slice corresponds to the total memory allocated for the list, which can be more than what's currently used to hold items. The returned value takes some unpacking: `self.items` is the slice pointing at the actual items stored in the list. Accessing the `ptr` field of this slice gives us a *many-item pointer* — a pointer to an unknown number of items (compared to slice, which points at a known number of items). The important thing to note here is that a many-item pointer supports slicing syntax, so we can do `self.items.ptr[0..self.capacity]` to get a slice which starts at the beginning of `self.items` and has a length of `self.capacity`. As `self.items` starts at the beginning of our allocated memory and all our allocated memory is one, contiguous chunk, the result is a slice of all the allocated memory for the list, which is returned to the `deinit` method and freed.

---

## Conclusion

We've covered quite a bit of ground just looking at how ArrayLists are initialized and deinitialized. We've seen a large part of the Zig language and touched on some of the topics that make it unique. [In the next article](/articles/a-slice-of-zig-2), we'll take a look at how the list is actually used, and how this usage is implemented in the standard library. You can subscribe to <a href="/feed.xml">this site's Atom feed</a> to be notified about any new articles in your RSS reader.

note:I'm relatively new to Zig and low-level programming myself. It's possible that there are errors in this article, or that something isn't explained as clearly as it could be. If you find an error or if you have questions, <a href="/">please let me know</a> and I'll do my best to update the article!endnote

### Exercise

To finish up, I wanted to leave you with a suggestion for experimenting with the concepts covered here. I don't think this article *alone* is a good resource for learning to program in Zig. However, after you use some of the [other](https://ziglang.org/documentation/master/) [resources](https://www.openmymind.net/learning_zig/) [available](https://codeberg.org/ziglings/exercises/) to get a grasp on the basics, it's a good exercise to try and write your own ArrayList implementation. We haven't yet covered how ArrayList does dynamic memory allocation, but for now you can use a simple, fixed-length array to hold the items of the list. Here's how you could go about writing your own list implementation:

- First, make the list hold only items of a specific data type like `i32` in a static array
- Implement methods to append to the list and to retrieve the item at a specific index
- Add some tests for your list in the same file
- Make the list generic so that it can hold any type

note:For your `append` method, you'll need to take *a pointer to `Self`* as a parameter (`*Self`), rather than just `Self`. You can call the method the same way as before, Zig will handle the pointer automatically. More on this in the next article.endnote

After covering dynamic memory allocation in ArrayList in the next article, we'll look at how to make the list grow as needed instead of being limited to a static size. For now, here's a simple, naive implementation of the exercise above:

hidden:
~~~ zig
const std = @import("std");
const expectEqual = std.testing.expectEqual;

fn MyList(T: type) type {
    return struct {
        const Self = @This();

        items: [10]T,
        length: usize,

        pub fn init() Self {
            return .{
                .items = undefined,
                .length = 0,
            };
        }

        // Right now, it's possible to add more elements than the list can hold,
        // which will result in a runtime error. We'll fix this in the next article.
        pub fn append(self: *Self, item: T) void {
            self.items[self.length] = item;
            self.length += 1;
        }

        pub fn get(self: *const Self, index: usize) T {
            return self.items[index];
        }
    };
}

test "basic list usage" {
    var list = MyList(i32).init();

    list.append(5);
    list.append(42);
    list.append(20_000);

    try expectEqual(5, list.get(0));
    try expectEqual(42, list.get(1));
    try expectEqual(20_000, list.get(2));
}

test "list holding struct" {
    const Point = struct {
        x: i32,
        y: i32,
    };

    var list = MyList(Point).init();
    list.append(.{ .x = 100, .y = 200 });
    list.append(.{ .x = 150, .y = 300 });

    try expectEqual(300, list.get(1).y);
}
~~~
endhidden

Hope you got something useful out of this article! See you in [the next one](/articles/a-slice-of-zig-2)!
