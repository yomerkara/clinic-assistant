import { Fragment } from "react";

/** Only plain text and validated external links; no raw HTML from messages. */
export function MessageText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => {
        if (!/^https?:\/\//.test(part))
          return <Fragment key={index}>{part.replace(/Haritada ara:\s*$/, "")}</Fragment>;
        try {
          const url = new URL(part);
          const maps =
            url.hostname === "www.google.com" && url.pathname.startsWith("/maps");
          return (
            <a
              key={index}
              href={url.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ overflowWrap: "anywhere" }}
            >
              {maps ? "Haritada görüntüle" : part}
            </a>
          );
        } catch {
          return <Fragment key={index}>{part}</Fragment>;
        }
      })}
    </>
  );
}
