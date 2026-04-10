'use client'

import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('Gecersiz email veya sifre')
      setLoading(false)
      return
    }

    router.push(callbackUrl)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf8f5]">
      {/* Soft decorative blobs */}
      <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-[#e8dff5] opacity-40 blur-3xl" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-[#d4ecf7] opacity-40 blur-3xl" />

      <div className="relative w-full max-w-md px-6">
        {/* Logo & Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#7c8cf5]/10 border border-[#7c8cf5]/20 mb-4">
            <svg className="w-8 h-8 text-[#7c8cf5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#2d2a26]">WhatsApp AI Platform</h1>
          <p className="text-[#8a8078] mt-1">Yonetim paneline giris yapin</p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-[#e8e2da] rounded-2xl p-8 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#5a554e] mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[#faf8f5] border border-[#e8e2da] rounded-xl text-[#2d2a26] placeholder-[#bfb8ae] focus:outline-none focus:ring-2 focus:ring-[#7c8cf5]/40 focus:border-[#7c8cf5]/40 transition-all"
                placeholder="admin@ocianix.com"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#5a554e] mb-1.5">
                Sifre
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#faf8f5] border border-[#e8e2da] rounded-xl text-[#2d2a26] placeholder-[#bfb8ae] focus:outline-none focus:ring-2 focus:ring-[#7c8cf5]/40 focus:border-[#7c8cf5]/40 transition-all"
                placeholder="********"
                required
              />
            </div>

            {error && (
              <div className="bg-[#e87272]/8 border border-[#e87272]/20 rounded-xl px-4 py-3 text-sm text-[#c45555]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-[#7c8cf5] hover:bg-[#6b7bf0] disabled:bg-[#b8c0f5] disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all duration-200 shadow-[0_4px_16px_-4px_rgba(124,140,245,0.4)]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Giris yapiliyor...
                </span>
              ) : (
                'Giris Yap'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[#bfb8ae] text-sm mt-6">
          Ocianix AI Solutions
        </p>
      </div>
    </div>
  )
}
