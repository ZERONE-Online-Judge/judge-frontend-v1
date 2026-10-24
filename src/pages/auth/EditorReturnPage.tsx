import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { editorReturnUrl } from '@/shared/lib/editorAuthRedirect';

export default function EditorReturnPage() {
  const [params] = useSearchParams();
  const destination = editorReturnUrl(params.get('next'));
  useEffect(() => {
    window.location.replace(destination);
  }, [destination]);
  return (
    <section className="mx-auto max-w-lg px-6 py-16 text-center">
      <p>ZOJ Editor로 돌아가고 있습니다.</p>
      <a href={destination}>에디터로 돌아가기</a>
    </section>
  );
}
