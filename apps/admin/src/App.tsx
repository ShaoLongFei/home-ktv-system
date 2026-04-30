import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ImportWorkbench } from "./imports/ImportWorkbench.js";

export function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ImportWorkbench />
    </QueryClientProvider>
  );
}
