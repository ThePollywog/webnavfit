.PHONY: start build preview

start: node_modules
	npm run dev

build: node_modules
	npm run build

preview: node_modules
	npm run preview

node_modules: package.json
	npm install
	touch node_modules
