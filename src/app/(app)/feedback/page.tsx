import { requireViewer } from "@/server/auth";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, myFeedback } from "@/server/support";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/primitives";
import { FeedbackForm, MyFeedback } from "@/components/app/support-forms";

export const metadata = { title: "Feedback" };

// Anyone tells Admin what works and what does not; replies come back here and as a notification.
export default async function FeedbackPage() {
  const viewer = await requireViewer();
  return (
    <div className="space-y-4">
      <PageHeader help="account" title="Feedback" description="Ideas, problems, questions or praise for the app. Admin reads every message." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Send feedback</CardTitle>
            <CardDescription>You can also send it from any page: account menu, Send feedback.</CardDescription>
          </CardHeader>
          <CardContent>
            <FeedbackForm categories={FEEDBACK_CATEGORIES} page="/feedback" />
          </CardContent>
        </Card>
        <MyFeedback rows={await myFeedback(viewer)} categories={FEEDBACK_CATEGORIES} statuses={FEEDBACK_STATUSES} />
      </div>
    </div>
  );
}
