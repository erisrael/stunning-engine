import { corrPage } from "@/server/corr/page";
import { listStamps, mySignatures, publicKey, signPolicy } from "@/server/corr/signing";
import { orgChart } from "@/server/corr/org";
import { listCategories, listEntities } from "@/server/corr/setup";
import { roleCatalog } from "@/server/role-catalog";
import { userDirectory } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import { CorrNav } from "@/components/app/corr/corr-nav";
import { SignaturesClient } from "./signatures-client";

export const metadata = { title: "Signatures and stamps" };

export default async function SignaturesPage() {
  const { viewer, rights } = await corrPage();
  const [mine, stamps, key, chart, roles, people, entities] = await Promise.all([mySignatures(viewer), listStamps(), publicKey(), rights.admin ? orgChart() : Promise.resolve(null), rights.admin ? roleCatalog() : Promise.resolve([]), rights.admin ? userDirectory() : Promise.resolve([]), listEntities()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Signatures and stamps" description="Your signature for the letters you sign, the company's official stamps (drawn here or uploaded), and where and when they are used." />
      <CorrNav active="signatures" rights={rights} />
      <SignaturesClient
        mine={mine.map((s) => ({ id: s.id, image: s.image, kind: s.kind, active: !!s.active, revokedAt: s.revoked_at, createdAt: s.created_at, validTo: s.valid_to }))}
        stamps={rights.admin ? stamps : stamps.filter((s) => s.active).map((s) => ({ ...s, allowed: {} }))}
        canDesign={rights.admin}
        keyInfo={{ fingerprint: key.fingerprint, algorithm: key.algorithm }}
        positions={chart?.positions.map((p) => ({ id: p.id, title: p.title })) ?? []}
        roles={roles.map((r) => ({ key: r.key, label: r.label }))}
        people={people.map((p) => ({ id: p.id, name: p.name }))}
        entities={entities.map((e) => ({ id: e.id, name: e.legalName }))}
        policy={await signPolicy()}
        categories={rights.admin ? (await listCategories()).map((c) => ({ code: c.code, name: c.name })) : []}
      />
    </div>
  );
}
