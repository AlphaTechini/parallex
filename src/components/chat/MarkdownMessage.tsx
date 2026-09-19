import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? url : "";
  } catch {
    return "";
  }
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        components={{
          a: ({ children, href }) => (
            <a
              href={href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {children}
            </a>
          ),
        }}
        rehypePlugins={[rehypeSanitize]}
        urlTransform={safeUrl}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
