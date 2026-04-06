export default function MarkdownEditor() {
  return (
    <section className="flex-1 flex flex-col bg-surface-container-lowest overflow-hidden">
      <div className="h-12 flex items-center justify-between px-lg border-b border-outline-variant/20">
        <span className="text-body-sm font-mono text-on-surface-variant">Maine.md</span>
        <button type="button" className="px-md py-xs bg-primary text-on-primary text-body-sm font-semibold rounded">
          Edit
        </button>
      </div>
      <div className="flex-1 p-2xl overflow-y-auto flex justify-center">
        <div className="max-w-3xl w-full">
          <h1 className="font-display text-4xl font-extrabold text-on-surface mb-md">Maine Vacation</h1>
          <div className="prose prose-slate max-w-none text-on-surface-variant">
            <p>Our upcoming summer trip to the Northeast.</p>
          </div>
        </div>
      </div>
    </section>
  )
}