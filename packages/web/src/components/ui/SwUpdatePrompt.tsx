// PWA temporalmente desactivada (vite.config.ts): el plugin PWA genera el
// virtual:pwa-register; sin él este import no resuelve. Stub no-op que
// mantiene la API del componente intacta para cuando se reactive.
// import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect } from 'react';

export function SwAutoUpdate() {
  // useRegisterSW({
  //   onRegisteredSW(_swUrl, registration) {
  //     if (!registration) return;
  //     setInterval(() => {
  //       registration.update();
  //     }, 60_000);
  //   },
  // });

  useEffect(() => {
    if (!navigator.serviceWorker) return;
    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  return null;
}
