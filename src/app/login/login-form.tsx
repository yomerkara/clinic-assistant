"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  LockKey,
} from "@phosphor-icons/react";
import { useState } from "react";

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <>
      <a className="google-btn" href="/api/auth/google">
        <Image src="/google-g.svg" alt="" width={24} height={24} />
        <span>Google ile devam et</span>
        <ArrowRight aria-hidden="true" weight="regular" />
      </a>

      <div className="auth-divider">
        <span>veya kullanıcı bilgilerinizle</span>
      </div>

      <form className="auth-form" action="/api/auth/login" method="post">
        <div className="field auth-field">
          <label htmlFor="email">Kullanıcı adı veya e-posta</label>
          <div className="auth-input-wrap">
            <EnvelopeSimple aria-hidden="true" weight="fill" />
            <input
              id="email"
              name="identifier"
              type="text"
              autoComplete="username"
              placeholder="Kullanıcı adınız"
              maxLength={254}
              required
            />
          </div>
        </div>

        <div className="field auth-field">
          <label htmlFor="password">Şifre</label>
          <div className="auth-input-wrap">
            <LockKey aria-hidden="true" weight="fill" />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              minLength={8}
              required
            />
            <button
              className="auth-password-toggle"
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeSlash aria-hidden="true" />
              ) : (
                <Eye aria-hidden="true" />
              )}
            </button>
          </div>
          <div className="auth-forgot-row">
            <Link className="auth-forgot" href="/forgot-password">
              Şifremi unuttum
            </Link>
          </div>
        </div>

        <button className="auth-submit" type="submit">
          <span>Giriş yap</span>
          <ArrowRight aria-hidden="true" weight="regular" />
        </button>
      </form>
    </>
  );
}
