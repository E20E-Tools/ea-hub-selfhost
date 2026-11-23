import ReactMarkdown, { type Components } from "react-markdown";
import { Link } from "@tanstack/react-router";
import { chatLinkTarget, chatProductId } from "@/lib/chat-links";

/** Shared renderer for chat message text (AI, visitor and team replies). */
export function ChatMarkdown({
  children,
  onOpenProduct,
}: {
  children: string;
  onOpenProduct?: ((productId: string) => boolean | void) | undefined;
}) {
  const components: Components = {
    // Never load remote images automatically (privacy); show their description instead.
    img: ({ alt }) => (alt ? <span className="chat-image-alt">[{alt}]</span> : null),
    a: ({ href, children }) => {
      const target = chatLinkTarget(href);
      if (!target) return <span>{children}</span>;
      const productId = chatProductId(href);
      if (target.kind === "internal" && productId && onOpenProduct) {
        return (
          <a
            href={target.to}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              if (onOpenProduct(productId) !== false) event.preventDefault();
            }}
          >
            {children}
          </a>
        );
      }
      if (target.kind === "internal") return <Link to={target.to}>{children}</Link>;
      return (
        <a
          href={target.href}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          {children}
        </a>
      );
    },
  };

  return (
    <ReactMarkdown components={components} skipHtml>
      {children}
    </ReactMarkdown>
  );
}
