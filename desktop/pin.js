// The staff PIN prompt over the arcade kiosk. A wrong PIN waits a little longer each time.
const D = window.seedDesktop;
const pin = document.getElementById("pin");
const err = document.getElementById("err");
let tries = 0;
let busy = false;
async function leave() {
  if (busy) return;
  busy = true;
  const ok = await D.leaveKiosk(pin.value);
  if (!ok) {
    tries++;
    pin.value = "";
    err.textContent = "That is not the PIN.";
    await new Promise((r) => setTimeout(r, Math.min(10000, 500 * 2 ** tries)));
  }
  busy = false;
}
document.getElementById("ok").addEventListener("click", leave);
document.getElementById("cancel").addEventListener("click", () => D.cancelLeave());
pin.addEventListener("keydown", (e) => {
  if (e.key === "Enter") leave();
  if (e.key === "Escape") D.cancelLeave();
});
