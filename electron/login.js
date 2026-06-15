const qrImage = document.querySelector("#qrImage");
const qrPlaceholder = document.querySelector("#qrPlaceholder");
const statusText = document.querySelector("#status");
const refreshBtn = document.querySelector("#refreshBtn");

let currentKey = "";
let timer = null;

function setStatus(text) {
  statusText.textContent = text;
}

async function createQr() {
  clearInterval(timer);
  currentKey = "";
  qrImage.removeAttribute("src");
  qrImage.hidden = true;
  qrPlaceholder.hidden = false;
  qrPlaceholder.textContent = "Creating QR code";
  setStatus("Please wait.");
  try {
    const data = await window.claudioDesktop.createNeteaseQr();
    currentKey = data.key;
    qrImage.src = data.qrimg;
    qrImage.hidden = false;
    qrPlaceholder.hidden = true;
    setStatus("Scan with the NetEase Music app and confirm login.");
    timer = setInterval(checkQr, 1800);
  } catch (error) {
    qrPlaceholder.textContent = "QR code failed";
    setStatus(error.message || "Check NetEase API settings.");
  }
}

async function checkQr() {
  if (!currentKey) return;
  try {
    const data = await window.claudioDesktop.checkNeteaseQr(currentKey);
    if (data.code === 800) {
      setStatus("QR code expired. Refresh it.");
      clearInterval(timer);
    } else if (data.code === 801) {
      setStatus("Waiting for scan.");
    } else if (data.code === 802) {
      setStatus("Scanned. Confirm login on your phone.");
    } else if (data.code === 803) {
      setStatus("Login succeeded. Applying cookie.");
      clearInterval(timer);
      setTimeout(() => window.close(), 900);
    } else {
      setStatus(data.message || `Status: ${data.code}`);
    }
  } catch (error) {
    setStatus(error.message || "Login check failed.");
  }
}

refreshBtn.addEventListener("click", createQr);
createQr();
