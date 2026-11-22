# @myseed-verify/web

Browser SDK for MySeed Verify. With it, a payer submits a receipt for a payment request and sees the result. It uses only the scoped submission token that your server receives when it creates the request. It never needs, and must never get, a server key.

```sh
npm install @myseed-verify/web
```

## Drop-in payment component

```html
<div id="pay"></div>
<script type="module">
  import { mountPayment } from "@myseed-verify/web";
  const { token } = await (await fetch("/api/start-payment", { method: "POST" })).json(); // from your server
  mountPayment(document.getElementById("pay"), {
    token,
    baseUrl: "https://verify.myseed.com.et",
    onResult: (s) => s.status === "accepted" && location.assign("/thank-you"),
  });
</script>
```

The component works like this:

- **Shows what is owed:** the amount, and who the money goes to.
- **Takes a receipt:** a receipt link, the text of the receipt's QR code, or a receipt file. Where the browser can read QR codes, it can also scan one with the camera.
- **Follows the check:** it shows progress until the result is in.
- **Keeps your page safe:** it runs in a shadow root, so it does not touch your styles, and it puts text from the API in as plain text, never as HTML.
- **Theming:** it follows the visitor's light or dark setting. Set the CSS variables `--mv-accent`, `--mv-text` and `--mv-bg` on the element to theme it.
- **Your own wording:** replace any of its text with the `text` option.

## Your own interface

```js
import { VerifyBrowserClient } from "@myseed-verify/web";

const client = new VerifyBrowserClient({ requestId, token, baseUrl: "https://verify.myseed.com.et" });
const sub = await client.submit({ kind: "link", value: receiptUrl }); // or client.submitReceipt(file)
const result = await client.waitForResult(sub.submissionId, { onUpdate: (s) => render(s) });
```

When `result.status` is `rejected`, show `result.feedback.message` to the payer. It tells them what to do next.
