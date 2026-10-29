// every form and every question on the page is a <dialog> opened with
// showModal(). the browser then keeps focus inside it, closes it on escape,
// and leaves the page behind it alone. the overlays before were divs faded in
// with a transition on visibility, which kept them hidden for their first
// frame: the field they focused on opening was still hidden at that moment,
// and the focus went nowhere.

export function openDialog(id, focusId = null) {
  const dialog = document.getElementById(id);
  if (!dialog) return;

  if (!dialog.open) dialog.showModal();
  if (focusId) document.getElementById(focusId)?.focus();
}

export function closeDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog?.open) dialog.close();
}

// deleting a card and deleting a wish ask the same question. it resolves true
// for yes, and false however else the dialog was closed: cancel, escape, or a
// click beside it
let answer = null;

export function confirmDialog({ title, question, name }) {
  document.getElementById("confirmTitle").textContent = title;

  const what = document.createElement("span");
  what.className = "dialog-name";
  what.textContent = name;
  document.getElementById("confirmDesc").replaceChildren(question, what, "?");

  // a stray enter keeps what is there: the focus starts on cancel
  openDialog("confirmDialog", "confirmCancel");
  return new Promise(resolve => { answer = resolve; });
}

export function initializeDialogs() {
  document.querySelectorAll("dialog.dialog").forEach(dialog => {
    dialog.addEventListener("click", e => {
      if (e.target.closest("[data-close]")) {
        dialog.close();
        return;
      }

      // everything inside a dialog sits in .dialog-body, so the dialog itself
      // is the target only of a click on the dark around it. that closes the
      // ones with nothing typed into them; a form keeps what was typed
      if (e.target === dialog && dialog.hasAttribute("data-light-dismiss")) dialog.close();
    });
  });

  const confirm = document.getElementById("confirmDialog");
  if (!confirm) return;

  document.getElementById("confirmOk").addEventListener("click", () => confirm.close("ok"));
  confirm.addEventListener("close", () => {
    const resolve = answer;
    answer = null;
    resolve?.(confirm.returnValue === "ok");
    confirm.returnValue = "";
  });
}
