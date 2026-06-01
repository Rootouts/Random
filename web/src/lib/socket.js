import { io } from "socket.io-client";
export const socket = io(import.meta.env.VITE_SIGNAL_URL, { autoConnect: false });
