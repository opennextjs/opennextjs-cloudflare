import Image from "next/image";

import tomineImg from "../../public/tomine.webp";

export default function Page() {
	return (
		<div>
			<Image src={tomineImg} alt="Picture of Tomine" />
		</div>
	);
}
