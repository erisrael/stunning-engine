# Receipt OCR

The evidence package wraps a locally provisioned Tesseract 5 executable. It accepts PNG or JPEG bytes and returns text, word count, and mean word confidence for receipt field extraction. A provider lookup supplies the evidence used for payment verification.

## Run locally

Provision Node 24, Tesseract 5, and the required language data. Use the [Tesseract installation guide](https://tesseract-ocr.github.io/tessdoc/Installation.html) to find the appropriate distribution. English (`eng`) is the default. To evaluate English and Amharic together, provision both language models and set `OCR_LANGUAGES=eng+amh` in the worker or shell environment.

Run these commands from the repository root.

```sh
npm ci
npm run build
npm run ocr -- --check
npm run ocr -- packages/evidence/test/fixtures/synthetic-receipt.png --show-text
npm test
```

The last receipt command should find `TV-1842` and `1250.00` in the synthetic image. Omit `--show-text` to print only recognition metadata. Use extracted text from real receipts only in the authorized evidence pipeline.

If the Windows executable is outside PATH, set its full path before running the commands.

```powershell
$env:TESSERACT_BIN = 'C:\Program Files\Tesseract-OCR\tesseract.exe'
$env:OCR_NATIVE_TEST = '1'
npm run ocr -- --check
npm test
```

Set `TESSDATA_DIR` if the executable requires an explicit model directory. `OCR_TIMEOUT_MS` overrides the default 12-second timeout for the local CLI. The readiness check confirms the required languages are listed. Enable `OCR_NATIVE_TEST=1` to test actual recognition and model loading on the synthetic receipt.

## Use in the verification worker

```ts
import { TesseractOcr } from "@transaction-verify/evidence";

const ocr = new TesseractOcr({
  executable: process.env.TESSERACT_BIN,
  tessdataDir: process.env.TESSDATA_DIR,
  languages: process.env.OCR_LANGUAGES,
  concurrency: 2,
});

await ocr.check();
const result = await ocr.recognize(receiptBytes, leaseAbortSignal);
```

Reuse one instance per OCR worker process. The database queue remains the source of pending jobs. Lease only as many jobs as the worker can handle, and bound the object read before calling the adapter. Keep the lease longer than the complete read and OCR budget, abort work when the lease is lost, and check ownership again before recording results. Use OS or container CPU and memory limits for the isolated worker because image decoding uses native code.

Send usable QR codes, receipt references, and PDF text through their extraction paths first. If receipt comparison requires image text, queue only the page or image needed. Rasterization of image-only PDFs belongs in a separate bounded job. Test page segmentation, language selection, and confidence thresholds against authorized provider samples before setting policy. Tesseract confidence is an OCR signal for review and extraction quality. [Tesseract segmentation and language options](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html)

| Outcome | Worker action |
|---|---|
| `ocr_unsupported_image`, `ocr_invalid_image`, `ocr_input_limit`, `ocr_no_text` | Ask for a corrected image, QR, or provider link. |
| `ocr_busy` | Return work to the queue for a later lease. |
| `ocr_cancelled` | Stop processing. Discard results if the job lease was lost. |
| `ocr_unavailable` | Mark the worker unhealthy and surface a runtime or model provisioning issue to operations. |
| `ocr_timeout`, `ocr_output_limit`, `ocr_failed` | Record the safe reason and route repeated or deterministic failures to correction or staff review. |

The adapter launches the executable directly with fixed arguments and pipes receipt bytes through standard input. It bounds compressed input at 8 MiB, decoded dimensions at 12 million pixels, and each output stream at 512 KiB. It enforces a process deadline, aborts on cancellation, omits native diagnostics from errors, and sets one OpenMP thread per child. Worker concurrency defaults to two and has no in-memory waiting queue. [Tesseract parallelism guidance](https://tesseract-ocr.github.io/tessdoc/FAQ)
