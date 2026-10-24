import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { usePresentationSession } from '@/domains/presentationAccess/session';
import { OperatorScoreboardPresentationContent } from '@/pages/operator/OperatorScoreboardPresentationPage';

export default function PresentationPage() {
  const { contestId } = useParams();
  const session = usePresentationSession((state) => state.session);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (session && Date.parse(session.expires_at) <= now)
      usePresentationSession.getState().setSession(null);
  }, [session, now]);
  if (!session || !contestId || session.contest_id !== contestId)
    return <Navigate replace to="/login?reason=presentation" />;
  return (
    <OperatorScoreboardPresentationContent
      contestId={contestId}
      token={session.access_token}
      now={now}
      displayOnly
    />
  );
}
