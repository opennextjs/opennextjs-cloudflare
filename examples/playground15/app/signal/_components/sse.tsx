"use client";

import { useEffect, useRef, useState } from "react";

export default function SSE() {
	const [events, setEvents] = useState<any[]>([]);
	const [start, setStart] = useState(false);
	const eventSourceRef = useRef<EventSource | null>(null);

	useEffect(() => {
		if (start) {
			const e = new EventSource("/api/signal/abort");
			eventSourceRef.current = e;

			e.onmessage = (msg) => {
				try {
					const data = JSON.parse(msg.data);
					setEvents((prev) => prev.concat(data));
				} catch (err) {
					console.log("failed to parse: ", err, msg);
				}
			};
		}

		return () => {
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}
		};
	}, [start]);

	const handleStart = () => {
		setEvents([]);
		setStart(true);
	};

	const handleClose = () => {
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}
		setStart(false);
	};

	return (
		<section>
			<div>
				<button onClick={handleStart} data-testid="start-button" disabled={start}>
					Start
				</button>
				<button onClick={handleClose} data-testid="close-button" disabled={!start}>
					Close
				</button>
			</div>
			{events.map((e, i) => (
				<div key={i}>
					Message {i}: {JSON.stringify(e)}
				</div>
			))}
		</section>
	);
}
