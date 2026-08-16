import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export default function OnlineStatus() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-yellow-900 text-center text-sm font-medium py-2 safe-top">
      No internet connection — data operations require an online connection.
    </div>
  );
}
