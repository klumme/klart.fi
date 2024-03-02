addEventListener("DOMContentLoaded", function (event) {
  document.body.classList.add("js");

  const hiddens = document.getElementsByClassName("hidden");

  for (let element of hiddens) {
    let isHidden = true;

    const button = document.createElement("a");
    button.classList.add("show");
    element.parentNode.insertBefore(button, element);

    hide(element, button);

    button.addEventListener("click", function (event) {
      if (isHidden) {
        show(element, button);

      } else {
        hide(element, button);
      }
      isHidden = !isHidden;
    });
  }
});

function hide(element, button) {
  element.classList.remove("shown");
  button.textContent = "Click here to show hidden content";
}

function show(element, button) {
  element.classList.add("shown");
  button.textContent = "Click here to hide content";
}
