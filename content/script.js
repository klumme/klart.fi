addEventListener("DOMContentLoaded", function (event) {
  const hiddens = document.getElementsByClassName("hidden");

  for (let element of hiddens) {
    let isHidden = true;

    const button = document.createElement("a");
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
  element.classList.add("notshown");
  element.classList.remove("shown");
  button.textContent = "Click to show hidden content";
}

function show(element, button) {
  element.classList.add("shown");
  element.classList.remove("notshown");
  button.textContent = "Click to hide content";
}
