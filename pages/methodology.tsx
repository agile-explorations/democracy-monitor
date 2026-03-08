import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function MethodologyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/system/methodology');
  }, [router]);
  return null;
}
