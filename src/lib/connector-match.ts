// Matching a provider's API fields to the app's (Phase 27), shared by the server and Admin's screen.

export const CAPABILITIES = {
  sms: { label: "SMS", vars: ["to", "message", "sender"] },
  email: { label: "Email", vars: ["to", "subject", "text", "html", "from", "fromName"] },
  payment: { label: "Payments", vars: ["amount", "amount_cents", "currency", "reference", "email", "phone", "first_name", "last_name", "description", "callback_url", "return_url"] },
  webhook: { label: "Webhook (send events)", vars: ["event", "title", "body", "link", "json"] },
  other: { label: "Other", vars: ["value"] },
} as const;
export type Capability = keyof typeof CAPABILITIES;

export type Field = { name: string; in: "body" | "query" | "path" | "header" | "form"; required: boolean; type: string; description?: string };

// Synonyms of each app field in providers' APIs.
const SYN: Record<string, string[]> = {
  to: ["to", "recipient", "recipients", "phone", "phone_number", "phonenumber", "mobile", "msisdn", "destination", "number", "receiver", "address", "email", "to.email", "personalizations.to", "To"],
  message: ["message", "text", "body", "content", "msg", "sms", "Body", "message_body"],
  sender: ["from", "sender", "sender_id", "senderid", "identifier", "source", "From", "originator"],
  subject: ["subject", "title", "Subject"],
  text: ["text", "textcontent", "plain", "body", "content", "text_body", "plain_text"],
  html: ["html", "htmlcontent", "html_body", "body_html"],
  from: ["from", "sender", "from_email", "sender.email", "from.email", "From"],
  fromName: ["from_name", "fromname", "sender.name", "from.name", "name"],
  amount: ["amount", "total", "value", "price", "unit_amount"],
  amount_cents: ["amount_in_cents", "amount_cents", "unit_amount"],
  currency: ["currency", "currency_code", "currencycode"],
  reference: ["reference", "tx_ref", "txref", "order_id", "orderid", "merchant_reference", "client_reference", "external_id", "id", "invoice"],
  email: ["email", "customer_email", "customer.email", "payer.email"],
  phone: ["phone", "phone_number", "msisdn", "mobile", "customer.phone", "customer.phone_number"],
  first_name: ["first_name", "firstname", "customer.first_name", "given_name"],
  last_name: ["last_name", "lastname", "customer.last_name", "family_name"],
  description: ["description", "narration", "reason", "title", "customization.description", "memo", "note"],
  callback_url: ["callback_url", "callbackurl", "notify_url", "webhook_url", "callback", "notification_url"],
  return_url: ["return_url", "returnurl", "success_url", "redirect_url", "redirecturl", "cancel_url"],
  event: ["event", "type", "event_type"],
  title: ["title", "subject", "summary"],
  body: ["body", "text", "message", "content", "description"],
  link: ["link", "url", "href"],
  json: ["data", "payload"],
  value: ["value", "data"],
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]/g, "");

export function matchFields(capability: Capability, fields: Field[]): Record<string, string> {
  const map: Record<string, string> = {};
  const vars = CAPABILITIES[capability].vars as readonly string[];
  const used = new Set<string>();
  for (const v of vars) {
    const syn = (SYN[v] ?? [v]).map(norm);
    const f = fields.find((x) => !used.has(x.name) && syn.includes(norm(x.name))) ?? fields.find((x) => !used.has(x.name) && syn.some((s) => norm(x.name).endsWith(`.${s}`) || norm(x.name).split(".").pop() === s));
    if (f) {
      map[f.name] = `{{${v}}}`;
      used.add(f.name);
    }
  }
  // Required fields nobody filled stay visible, empty, for Admin to give a fixed value.
  for (const f of fields) if (f.required && !(f.name in map) && f.in !== "header") map[f.name] = "";
  return map;
}

