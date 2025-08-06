"use client";

import { useState, useRef, useEffect } from "react";

export default function TestSignalPage() {
	const eventSource = useRef<EventSource | null>(null);
	const [messages, setMessages] = useState<string[]>([]);

	function startStream() {
		if (eventSource.current) {
			eventSource.current.close();
		}
		eventSource.current = new EventSource("/api/request/signal/sse");
		eventSource.current.onmessage = (event) => {
			setMessages((prev) => [...prev, event.data]);
		};
		eventSource.current.onerror = () => {
			abortStream();
		};
	}

	function abortStream() {
		if (eventSource.current) {
			eventSource.current.close();
			eventSource.current = null;
		}
	}

	useEffect(() => {
		return () => {
			abortStream();
		};
	}, []);

	return (
		<div>
			<button data-testid="start-stream" onClick={startStream}>
				Start Stream
			</button>
			<button data-testid="abort-stream" onClick={abortStream}>
				Abort Stream
			</button>
			<div data-testid="messages">
				{messages.map((msg, i) => (
					<div key={i}>{msg}</div>
				))}
			</div>
		</div>
	);
}
