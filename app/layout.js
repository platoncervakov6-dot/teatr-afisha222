export const metadata = {
  title: "Москва Афиша — Mini App",
  description: "Телеграм мини-приложение с афишей культурных мероприятий Москвы."
};

import "./globals.css";
import Script from "next/script";

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <head>
        {/* Telegram WebApp SDK (в Telegram доступен, для локального превью тоже подгружается) */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
