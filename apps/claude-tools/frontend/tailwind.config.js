/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./src/**/*.{ts,js,html}"],
	theme: {
		extend: {
			colors: {
				terminal: {
					bg: "#1e1e1e",
					"bg-alt": "#2d2d30",
					"bg-highlight": "#3e3e42",
					text: "#d4d4d4",
					"text-muted": "#8c8c8c",
					green: "#6a9955",
					orange: "#ce9178",
					red: "#f48771",
					blue: "#569cd6",
					purple: "#c586c0",
				},
			},
			fontFamily: {
				mono: ["Consolas", "Monaco", "Courier New", "monospace"],
			},
			spacing: {
				18: "4.5rem",
			},
		},
	},
	plugins: [],
};
