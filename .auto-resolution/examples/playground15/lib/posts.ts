const posts = [
	{
		id: 1,
		title: "Lorem Ipsum - What Is It and How to Use It?",
		content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ...",
		author: "John Doe",
		date: "2023-08-01",
		category: "Technology",
	},
	{
		id: 2,
		title: "The Benefits of Regular Exercise",
		content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ...",
		author: "Jane Smith",
		date: "2023-07-25",
		category: "Health & Fitness",
	},
	{
		id: 3,
		title: "Mastering the Art of Cooking",
		content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ...",
		author: "Michael Johnson",
		date: "2023-07-18",
		category: "Food & Cooking",
	},
	{
		id: 4,
		title: "Traveling on a Budget - Tips and Tricks",
		content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ...",
		author: "Emily Brown",
		date: "2023-07-10",
		category: "Travel",
	},
	{
		id: 5,
		title: "The Rise of Artificial Intelligence in Modern Society",
		content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ...",
		author: "David Lee",
		date: "2023-06-29",
		category: "Technology",
	},
	{
		id: 6,
		title: "10 Must-Read Books for Summer",
		content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ...",
		author: "Sarah Johnson",
		date: "2023-06-21",
		category: "Books",
	},
];

export const getPost = (opts: { id: string }) =>
	Promise.resolve(new Response(JSON.stringify(posts.find((p) => p.id === Number(opts.id)))));
