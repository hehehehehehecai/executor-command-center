import Link from "next/link";
import { notFound } from "next/navigation";

import {
  stagingVerificationOperations,
  type StagingVerificationOperation,
} from "@/application/staging-verification/staging-verification";
import { createStagingVerificationBoundary } from "@/app/api/staging-verification/staging-verification-route-dependencies";

export const dynamic = "force-dynamic";

async function loadAuthorizedTarget() {
  try {
    const dependencies = await createStagingVerificationBoundary(new Headers());
    const userId = await dependencies.session.getVerifiedUserId();
    if (!userId) notFound();
    return await dependencies.authorizer.assertTarget({
      userId,
      expected: dependencies.target,
    });
  } catch {
    notFound();
  }
}

function VerificationForms(input: {
  readonly operation: StagingVerificationOperation;
  readonly projectId: string;
}) {
  const base = `/api/staging-verification/${input.operation}`;
  return (
    <section className="panel" aria-labelledby={`${input.operation}-title`}>
      <h2 id={`${input.operation}-title`}>{input.operation}</h2>
      <p>先签发一次性 ticket，再使用完全相同的 Case ID 执行一次 operation。</p>
      <form method="post" action={`${base}/ticket`}>
        <input type="hidden" name="projectId" value={input.projectId} />
        <label>
          Ticket Case ID
          <input
            name="caseId"
            required
            minLength={8}
            maxLength={64}
            pattern="[A-Za-z0-9][A-Za-z0-9._-]{7,63}"
            autoComplete="off"
          />
        </label>
        <button type="submit">签发 {input.operation} ticket</button>
      </form>
      <form method="post" action={base}>
        <input type="hidden" name="projectId" value={input.projectId} />
        <label>
          Execution Case ID
          <input
            name="caseId"
            required
            minLength={8}
            maxLength={64}
            pattern="[A-Za-z0-9][A-Za-z0-9._-]{7,63}"
            autoComplete="off"
          />
        </label>
        <button type="submit">执行 {input.operation}</button>
      </form>
    </section>
  );
}

export default async function StagingVerificationPage() {
  const target = await loadAuthorizedTarget();
  return (
    <main id="main-content" className="panel-stack" tabIndex={-1}>
      <p className="section-kicker">Staging verification</p>
      <h1>Staging 一次性验证控制面</h1>
      <p>
        该页面只在原生 Staging、已验证 session、固定 installation、repository 与 Project
        所有权全部匹配时可用。每个 ticket 只能消费一次。
      </p>
      <dl>
        <dt>Project</dt>
        <dd>{target.projectId}</dd>
        <dt>Repository</dt>
        <dd>{target.repositoryFullName}</dd>
      </dl>
      {stagingVerificationOperations.map((operation) => (
        <VerificationForms
          key={operation}
          operation={operation}
          projectId={target.projectId}
        />
      ))}
      <Link href="/onboarding">返回 Onboarding</Link>
    </main>
  );
}
