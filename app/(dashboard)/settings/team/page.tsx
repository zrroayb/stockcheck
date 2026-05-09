import { OrganizationProfile } from '@clerk/nextjs'

export default function TeamPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-gray-400">
          Manage members of your workspace. Invitations and roles are handled by Clerk.
        </p>
      </div>
      <div className="card">
        <OrganizationProfile routing="hash" />
      </div>
    </div>
  )
}
