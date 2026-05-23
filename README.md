# ElastiX

Drag-and-drop builder for composing Elasticsearch query bodies. Drag clauses from the palette onto the canvas, configure them in the inspector, and copy the generated JSON.

## Run

```sh
npm install
npm run dev
```

Opens http://localhost:5173

## Build

```sh
npm run build
```

## Stack

- Vite + React 18 + TypeScript
- @dnd-kit (drag and drop)
- Zustand (state, persisted to localStorage)
- Tailwind CSS
- Monaco Editor (JSON output)

## How to use

1. Drag a `bool` (or any clause) from the left palette onto the canvas.
2. For `bool`: drag more clauses into its `must` / `should` / `must_not` / `filter` slots.
3. Click a clause to edit its fields in the right inspector.
4. The JSON pane at the bottom shows the live ES query body.
5. Click **Copy** to put the JSON on your clipboard — paste it into Kibana Dev Tools as the body of `GET /<index>/_search`.

Tree state persists to `localStorage` automatically. Use the **Clear** button to start over.
