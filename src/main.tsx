import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Search from "./pages/Search.tsx";
import ProgramDetail from "./pages/ProgramDetail.tsx";
import "./index.css";

const router = createBrowserRouter([
  { path: "/", element: <Search /> },
  { path: "/program/:id", element: <ProgramDetail /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
