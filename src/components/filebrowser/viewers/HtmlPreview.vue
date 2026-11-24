<template>
	<iframe class="html-preview-frame" :title="title" sandbox="" referrerpolicy="no-referrer" :srcdoc="previewDocument"></iframe>
</template>

<script>
import DOMPurify from 'dompurify'

export default {
	props: {
		code: { type: String, required: true },
		title: { type: String, required: true },
	},
	computed: {
		previewDocument() {
			// Keep the document's layout and embedded styles. Remove elements and
			// attributes that can navigate the sandbox or replace its contents.
			const html = DOMPurify.sanitize(this.code, {
				WHOLE_DOCUMENT: true,
				RETURN_DOM: true,
				ADD_TAGS: ['style'],
				FORBID_TAGS: ['base', 'meta', 'link', 'script', 'iframe', 'frame', 'object', 'embed', 'template'],
				FORBID_ATTR: ['href', 'xlink:href', 'ping', 'srcdoc', 'action', 'formaction'],
			})
			const policy = html.ownerDocument.createElement('meta')
			policy.httpEquiv = 'Content-Security-Policy'
			policy.content = 'default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; form-action \'none\'; base-uri \'none\''
			html.querySelector('head').prepend(policy)
			return `<!doctype html>${html.outerHTML}`
		},
	},
}
</script>

<style scoped>
.html-preview-frame {
	display: block;
	width: 100%;
	height: 100%;
	border: 0;
	background: white;
}
</style>
