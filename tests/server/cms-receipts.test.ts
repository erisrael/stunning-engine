import assert from "node:assert/strict";
import { cmsReceiptAttachments } from "../../src/lib/cms-receipts";

const base = "https://cms.example.test/";
assert.deepEqual(cmsReceiptAttachments(`<a href="/invoices/7/download">Invoice</a><a href='/storage/slips/proof.PDF?download=1'>Slip</a>`, base), {
  imageUrl: null, pdfUrl: `${base}storage/slips/proof.PDF?download=1`,
});
console.log("PASS Uploaded PDF slips use the PDF preview and take precedence over generated invoice downloads");

assert.deepEqual(cmsReceiptAttachments(`<img src="/storage/logo.png"><img data-src='/storage/slips/proof.png?a=1&amp;b=2' src='data:image/png;base64,AA'><a href='/invoices/7/download'>Invoice</a>`, base), {
  imageUrl: `${base}storage/slips/proof.png?a=1&b=2`, pdfUrl: `${base}invoices/7/download`,
});
console.log("PASS Lazy images, single-quoted attributes and signed query separators are preserved without selecting logos");

assert.deepEqual(cmsReceiptAttachments(`<a type="application/pdf" href="&#x2f;storage&#47;proof">Slip</a><img src="/storage/proof.pdf">`, base), {
  imageUrl: null, pdfUrl: `${base}storage/proof`,
});
console.log("PASS Typed PDF attachments and PDFs inside image tags are classified correctly");

assert.deepEqual(cmsReceiptAttachments(`<img src="https://outside.test/storage/slip.png"><img src="https://user:password@cms.example.test/storage/slip.png"><a href="javascript:alert(1)">PDF</a><img src="/storage/avatar.png">`, base), {
  imageUrl: null, pdfUrl: null,
});
console.log("PASS Receipt extraction excludes other origins, embedded credentials and unrelated avatars");
