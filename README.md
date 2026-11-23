# File Browser

File Browser is a self-hosted web app for managing a folder on your Docker host. You can browse, upload, download, preview, and edit files, as well as move, copy, star, and trash them. It runs on its own and uses a single shared login. The interface comes from [ReCasaOS Files](https://github.com/ReCasaOS/CasaOS-UI).

## Install with Docker

You need Docker with the Compose plugin, `curl`, and `openssl` on a Linux, macOS, or Windows (WSL2) host. The image supports Linux `amd64` and `arm64` containers. Run the commands below in a terminal as the regular user who owns the data folder. On Windows, run them inside your WSL distribution.

```sh
mkdir -p file-browser/files-data
cd file-browser
curl -fsSLO https://raw.githubusercontent.com/jtenniswood/files/main/compose.yaml
test -f .env || (umask 077; printf 'FILES_PASSWORD=%s\nFILES_UID=%s\nFILES_GID=%s\n' \
  "$(openssl rand -hex 24)" "$(id -u)" "$(id -g)" > .env)
docker compose up -d --wait
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080) on the Docker host. Sign in as `files` and use the `FILES_PASSWORD` value from `.env`. Display it with `sed -n 's/^FILES_PASSWORD=//p' .env`. The app shows the `files-data` folder as **DATA**. Files you put there on the host appear in the app, and files you upload or edit in the app are saved there.

The Compose file pulls `ghcr.io/jtenniswood/files:latest` from GitHub Container Registry. [View available image tags](https://github.com/jtenniswood/files/pkgs/container/files).

## Choose a folder or port

Set these options in `.env` beside `compose.yaml`, then run `docker compose up -d --wait` again.

| Variable | What it controls | Default |
| --- | --- | --- |
| `FILES_DIRECTORY` | Host folder to manage. Use an existing absolute path to select a different folder. | `./files-data` |
| `FILES_PUBLISH_PORT` | Port on the Docker host. | `8080` |
| `FILES_USERNAME` | Login name. | `files` |
| `FILES_PASSWORD` | Login password, at least 12 characters. Use single quotes in `.env` for a password containing `$` or `#`. | Required |
| `FILES_UID`, `FILES_GID` | Numeric user and group the container runs as. The install commands set them to your user and group. | `1000` |
| `FILES_MAX_UPLOAD_BYTES` | Maximum upload size per file. | `10737418240` (10 GiB) |
| `FILES_IMAGE` | Image tag to run. Set it to a `sha-…` tag to pin a specific build. | `ghcr.io/jtenniswood/files:latest` |

The container user needs permission to read and write the host folder. If the service fails to start, run `docker compose logs files` and check that the folder exists and that `FILES_UID` and `FILES_GID` have access.

For access from other devices, put File Browser behind an HTTPS reverse proxy on its own hostname. Preserve the original `Host` and `Authorization` headers and set the proxy’s upload size limit and timeouts for the files you expect. The supplied Compose file listens on the Docker host’s loopback address.

## Update, stop, or back up

Update the installed image from the same directory as `compose.yaml` and `.env`.

```sh
docker compose pull
docker compose up -d --wait
```

Run `docker compose down` to stop and remove the container. Your files stay in the host folder. Include its hidden `.files-state` directory in backups to keep starred items and trash. Files in the trash are kept for 30 days. Run one container per data folder.

## Build from source

Clone this repository and follow the folder and `.env` setup above from inside the checkout. The checkout already contains `compose.yaml`. Then run these commands.

```sh
docker build -t files:local .
FILES_IMAGE=files:local docker compose up -d --pull never --wait
```

For development outside Docker, use Node.js 24, Corepack, and `tar`. Run `corepack pnpm install --frozen-lockfile` followed by `corepack pnpm build:files`. With `FILES_PASSWORD` exported in your shell, run `corepack pnpm start:files`. For the local test suite, run `corepack pnpm exec vitest run`.

See [LICENSE](LICENSE) and [NOTICE](NOTICE) for license and attribution details.
