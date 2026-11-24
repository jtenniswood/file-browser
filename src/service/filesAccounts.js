export const filesSessionExpired = 'files-session-expired'

export async function filesAccountRequest(path, { method = 'GET', body } = {}) {
	const response = await fetch(`/v1/auth/${path}`, {
		method,
		credentials: 'same-origin',
		headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	const result = await response.json().catch(() => null)
	if (!response.ok || !result) {
		const error = new Error(result?.message || 'File Browser could not complete the request. Try again.')
		error.status = response.status
		if (response.status === 401 && path !== 'login')
			window.dispatchEvent(new Event(filesSessionExpired))
		throw error
	}
	return result.data
}
