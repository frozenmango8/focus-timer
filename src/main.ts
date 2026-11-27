import "@fontsource/newsreader/latin-500.css";
import "@fontsource/public-sans/latin-400.css";
import "@fontsource/public-sans/latin-500.css";
import "./style.css";
import { mount } from "./app";

const root = document.querySelector("#app");
if (root instanceof HTMLElement) mount(root);
