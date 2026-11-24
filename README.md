# Files

Files is a self-hosted web app for managing a folder on your Docker host. You can browse, upload, download, preview, edit, move, copy, star, and permanently delete files.

## Install with Docker

You need Docker with the Compose plugin and `curl` on a Linux, macOS, or Windows (WSL2) host. The image supports Linux `amd64` and `arm64` containers. Run the commands below in a terminal as the regular user who owns the data folder. On Windows, run them inside your WSL distribution.

```sh
mkdir -p file-browser/files-data
cd file-browser
curl -fsSLO https://raw.githubusercontent.com/jtenniswood/files/main/compose.yaml
test -f .env || printf 'FILES_UID=%s\nFILES_GID=%s\n' "$(id -u)" "$(id -g)" > .env
docker compose up -d --wait
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080) on the Docker host and follow the prompts to create the first administrator. Files shows the `files-data` folder as **DATA**. Files you put there on the host appear in the app, and files you upload or edit in the app are saved there.

The Compose file pulls `ghcr.io/jtenniswood/files:latest` from GitHub Container Registry. [View available image tags](https://github.com/jtenniswood/files/pkgs/container/files).

## Choose a folder or port

Set these options in `.env` beside `compose.yaml`, then run `docker compose up -d --wait` again.

| Variable | What it controls | Default |
| --- | --- | --- |
| `FILES_DIRECTORY` | Host folder to manage. Use an existing absolute path to select a different folder. | `./files-data` |
| `FILES_MOUNT_POINTS` | JSON array of additional Docker mount destinations to show in the sidebar. | `[]` |
| `FILES_PUBLISH_PORT` | Port on the Docker host. | `8080` |
| `FILES_BIND_ADDRESS` | IP address on the Docker host where Files is available. | `127.0.0.1` |
| `FILES_PUBLIC_ORIGIN` | Optional HTTPS address for a reverse proxy, such as `https://files.example.com`. | Unset |
| `FILES_UID`, `FILES_GID` | Numeric user and group the container runs as. The install commands set them to your user and group. | `1000` |
| `FILES_MAX_UPLOAD_BYTES` | Maximum upload size per file. | `10737418240` (10 GiB) |
| `FILES_IMAGE` | Image tag to run. Set it to a `sha-…` tag to pin a specific build. | `ghcr.io/jtenniswood/files:latest` |

With the default Docker setup, **Mount points** shows only **DATA**. Add any extra folder mounts under `/data` in Compose, then list their container destinations in `FILES_MOUNT_POINTS`. For example, for a mount at `/data/Archive`, set `FILES_MOUNT_POINTS='["/data/Archive"]'` in `.env`. Ordinary folders and mounts inherited from the host remain browsable inside **DATA**.

The container user needs permission to read and write the host folder. If the service fails to start, run `docker compose logs files` and check that the folder exists and that `FILES_UID` and `FILES_GID` have access.

## Connect from another device

Set `FILES_BIND_ADDRESS` in `.env` to the Docker host’s local network IP address, for example `192.168.1.50`. Run `docker compose up -d --wait`, then open `http://192.168.1.50:8080` from another device on the same network. Use your own IP address and the port you configured. Direct HTTP does not encrypt passwords or files in transit, so use it on a trusted network.

If you choose to use an HTTPS reverse proxy, set `FILES_PUBLIC_ORIGIN` to its HTTPS address and preserve the original `Host` header. Set the proxy’s upload size limit and timeouts for the files you expect.

If you enable network access before setting up the first administrator, the setup screen asks for a one-time code. Run `docker compose logs files` on the host and look for **Files setup code**. The code is generated again if you restart before finishing setup.

## Manage accounts

Open **Settings** from the Files sidebar. Administrators can create members or other administrators, reset another user's password or two-factor sign-in, and remove users. All users have read and write access to the same **DATA** folder.

Users can change their own password and set up two-factor sign-in with any compatible authenticator app. Save the recovery codes when they appear so you can sign in if you lose the app. Each code works once.

## Update, stop, or back up

Use the current `compose.yaml` with your existing data folder and `.env` settings. If you use a reverse proxy, make sure `FILES_PUBLIC_ORIGIN` is set to its HTTPS address. Run these commands from the directory containing `compose.yaml` and `.env`.

```sh
docker compose pull
docker compose up -d --wait
```

Run `docker compose down` to stop and remove the container. Your files stay in the host folder. Include its hidden `.files-state` directory in private backups to keep accounts and starred items. Run one container per data folder.

After an upgrade, any files still in the former Trash remain in the hidden `.files-state` directory on the host. In each entry folder, `entry.json` records the original path and `data` holds the file or folder. You can copy the contents back from the host.

## Show Samba shares on folders

On a Linux Samba host, Files can show a green **Shared** badge in the grid and list. The badge marks the folder configured as the share root. An enabled share can have its own access permissions, and the badge reflects configuration even when the Samba server is stopped.

The integration reads configured shares with `testparm` and enabled usershares with `net usershare info --long`. The Files user needs read access to the Samba configuration and any enabled usershare directory. Shares with per-user paths such as `%U` are skipped. Reload the folder view after changing the Samba configuration.

### Docker

Run the small inventory service on the Samba host so it can read the host's configuration, including its include files. A private Unix socket passes relative folder paths to the container. Use the same numeric user for the service as `FILES_UID` in `.env`.

1. On the Samba host, make sure `testparm`, `net`, and Node.js 24 are available. On Debian or Ubuntu, the commands are provided by `samba-common-bin`.
2. From the Files checkout, create `/etc/systemd/system/files-samba.service` with the following contents. Replace the user, absolute data directory, Node executable, and checkout path with the values on your host. The data directory must be the same host directory as `FILES_DIRECTORY` in `.env`.

   ```ini
   [Unit]
   Description=Files Samba inventory
   After=local-fs.target

   [Service]
   User=YOUR_FILES_USER
   RuntimeDirectory=files-samba
   RuntimeDirectoryMode=0700
   Environment="FILES_DIRECTORY=/srv/files"
   Environment=FILES_SAMBA_SOCKET=/run/files-samba/shares.sock
   ExecStart=/usr/bin/node /absolute/path/to/file-browser/standalone/samba-host.mjs
   Restart=on-failure

   [Install]
   WantedBy=multi-user.target
   ```

   Add `Environment="FILES_SAMBA_CONFIG=/absolute/path/to/smb.conf"` if your Samba installation uses a custom configuration file.

3. Start the inventory service and apply the Compose override.

   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable --now files-samba.service
   docker compose -f compose.yaml -f compose.samba.yaml up -d --wait
   ```

If the badges are missing, check `sudo journalctl -u files-samba.service -n 50` and confirm the service and container use the same UID and point at the same data directory.

### Running Files directly on the host

Start the app with `FILES_SAMBA=1` and `FILES_DIRECTORY` set to the host data directory. Set `FILES_SAMBA_CONFIG` if Samba uses a custom configuration file.

## Build from source

Clone this repository and follow the folder and `.env` setup above from inside the checkout. The checkout already contains `compose.yaml`. Then run these commands.

```sh
docker build -t files:local .
FILES_IMAGE=files:local docker compose up -d --pull never --wait
```

For development outside Docker, use Node.js 24, Corepack, and `tar`. Run `corepack pnpm install --frozen-lockfile`, `corepack pnpm build:files`, and `corepack pnpm start:files`. For the local test suite, run `corepack pnpm exec vitest run`.

See [LICENSE](LICENSE) and [NOTICE](NOTICE) for license and attribution details.
