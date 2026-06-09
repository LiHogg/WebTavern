import "./globals.css";
import type { Metadata } from "next";

import { SiteHeader } from "@/widgets/site-header/site-header";

export const metadata: Metadata = {
  title: "WebTavern",
  description: "Платформа бронирования заведений"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <div className="page-bg">
          <div className="container app-shell">
            <SiteHeader />
            <main className="content-area">{children}</main>
            <footer className="site-footer">
              <div className="site-footer-main">
                <section className="site-footer-brand" aria-label="О проекте">
                  <strong>WebTavern</strong>
                  <p>Учебная платформа поиска заведений и бронирования столов.</p>
                  <p className="site-footer-note">Дипломный демонстрационный проект. Перед коммерческим запуском реквизиты и условия работы нужно заменить на данные фактического оператора.</p>
                </section>

                <section className="footer-column" aria-label="Навигация по платформе">
                  <h2>Платформа</h2>
                  <nav className="footer-links">
                    <a href="/">Главная</a>
                    <a href="/venues">Заведения</a>
                    <a href="/notifications">Уведомления</a>
                    <a href="/partner">Для владельцев</a>
                    <a href="/legal">Все документы</a>
                  </nav>
                </section>

                <section className="footer-column" aria-label="Правовые документы">
                  <h2>Документы</h2>
                  <nav className="footer-links">
                    <a href="/legal/privacy">Политика конфиденциальности</a>
                    <a href="/legal/terms">Пользовательское соглашение</a>
                    <a href="/legal/personal-data">Согласие на обработку персональных данных</a>
                    <a href="/legal/booking-rules">Правила бронирования и отмены</a>
                    <a href="/legal/partner-rules">Правила размещения заведений</a>
                    <a href="/legal/contacts">Правовая информация и контакты</a>
                  </nav>
                </section>

                <section className="footer-column" aria-label="Контакты">
                  <h2>Контакты</h2>
                  <div className="footer-contact-list">
                    <a href="mailto:support@webtavern.local">support@webtavern.local</a>
                    <a href="mailto:privacy@webtavern.local">privacy@webtavern.local</a>
                    <a href="mailto:partners@webtavern.local">partners@webtavern.local</a>
                  </div>
                  <p className="site-footer-note">Вопросы по аккаунту, броням, персональным данным и подключению заведений.</p>
                </section>
              </div>

              <div className="site-footer-bottom">
                <span>© 2026 WebTavern</span>
                <span>Учебный проект. Не является публичной офертой.</span>
              </div>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
