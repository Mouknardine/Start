import { redirect } from 'next/navigation'
import Link from 'next/link'
import { checkAdminAccess } from '@/lib/supabase/admin'
import AdminClient from './AdminClient'

export const metadata = {
  title: 'Administration | Artisano',
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  // ⚡ Vérification côté serveur — impossible à contourner
  const { isAdmin, userId } = await checkAdminAccess()

  if (!userId) {
    redirect('/connexion')
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--gray-100)]">
        <div className="text-center py-[100px] px-5">
          <h2 className="font-sora text-[var(--red)] text-xl font-bold">Accès refusé</h2>
          <p className="text-[var(--gray-500)] mt-2 text-sm">
            Votre compte n&apos;a pas les droits d&apos;administration.
          </p>
          <Link href="/" className="text-[var(--orange)] mt-4 inline-block text-sm">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    )
  }

  return <AdminClient />
}
