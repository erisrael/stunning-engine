// Matching addresses against office networks, and reading the real address behind a proxy.
import { ipInRange, isHostName, isIpOrRange, parseIp } from "../../src/lib/ip-match";
import { clientIpFrom } from "../../src/server/client-ip";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
};
const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

check("one address matches itself", ipInRange("196.188.10.5", "196.188.10.5"));
check("and not its neighbour", !ipInRange("196.188.10.6", "196.188.10.5"));
check("a /24 range", ipInRange("196.188.10.200", "196.188.10.0/24") && !ipInRange("196.188.11.1", "196.188.10.0/24"));
check("a /0 range matches every IPv4 address", ipInRange("8.8.8.8", "0.0.0.0/0"));
check("IPv4 inside IPv6 counts as IPv4", ipInRange("::ffff:196.188.10.5", "196.188.10.0/24"));
check("IPv6 ranges", ipInRange("2001:db8:12::1", "2001:db8::/32") && !ipInRange("2001:db9::1", "2001:db8::/32"));
check("IPv6 shortened forms", parseIp("::1")?.n === BigInt(1) && parseIp("2001:db8::")?.family === 6);
check("families never mix", !ipInRange("1.2.3.4", "2001:db8::/32"));
check("bad input never matches", !ipInRange("not-an-ip", "0.0.0.0/0") && !ipInRange("1.2.3.4", "1.2.3.0/40") && !ipInRange("300.1.1.1", "0.0.0.0/0"));
check("entries are recognised", isIpOrRange("10.0.0.0/8") && isIpOrRange("2001:db8::/48") && !isIpOrRange("10.0.0.0/33") && !isIpOrRange("office.example.com"));
check("dynamic DNS names are recognised", isHostName("myseed-office.duckdns.org") && !isHostName("10.0.0.1") && !isHostName("no spaces.com"));

process.env.TRUSTED_PROXY_HOPS = "1";
check("behind one proxy, the address it added is used (not what the visitor wrote)", clientIpFrom(headers({ "x-forwarded-for": "6.6.6.6, 196.188.10.5" })) === "196.188.10.5");
check("a single entry is used", clientIpFrom(headers({ "x-forwarded-for": "196.188.10.5" })) === "196.188.10.5");
process.env.TRUSTED_PROXY_HOPS = "2";
check("behind two proxies, two back", clientIpFrom(headers({ "x-forwarded-for": "6.6.6.6, 196.188.10.5, 10.0.0.2" })) === "196.188.10.5");
process.env.TRUSTED_PROXY_HOPS = "0";
check("with no proxy the header is ignored", clientIpFrom(headers({ "x-forwarded-for": "6.6.6.6" })) === null);
process.env.TRUST_CLOUDFLARE = "1";
check("Cloudflare's header when trusted", clientIpFrom(headers({ "cf-connecting-ip": "196.188.10.9", "x-forwarded-for": "6.6.6.6" })) === "196.188.10.9");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
