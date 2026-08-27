# Page Override: Storage

> Overrides `design-system/turbopanel/MASTER.md` for environment Storage (Add Storage chip / Storage section).

**Surface:** environment Storage list and combined Add Storage form  
**Job:** Register a logical dataset, pin a physical copy, optionally attach a service mount.

---

## Model (this slice)

Storage is three rows, not one:

| Piece | Meaning | UI |
| --- | --- | --- |
| **Storage** | Identity (`volume` / `directory` / `file`) | Name + kind chips |
| **Copy** | Where bytes live (`docker` / `path` on a server) | Server picker; host path for directory/file |
| **Mount** | Service attachment | Optional service + destination path |

Bind mounts are **directory + path copy** (no separate bind kind). Docker named volumes are **volume + docker copy**. File bodies stay on `storage.content_envelope` (not shown in this form).

## Layout

- Combined **Add Storage** still creates storage + primary copy + optional mount in one submit.
- List shows **copy** (provider · server / path) on a separate line from **mount** destinations.
- Kind chips: **Volume / Directory / File** (sentence labels, not `docker_volume`).
- Destination path is on the mount. Creating a mount requires a service; omit both fields to register storage without attaching a container.
- No org-wide / NFS / S3 / rclone screens yet.

## Anti-patterns

- ❌ `serverId` / `sourcePath` / `destinationPath` on the storage identity row
- ❌ Bind as a fourth kind
- ❌ NFS / S3 provider pickers in this form
- ❌ Services-tab volume editor (YAML remains the authoring surface for named volumes)

## Follow-ups (not this slice)

NFS/CIFS host mounts, S3/MinIO object storage, rclone crypt scratch, `transfer` jobs, and standalone `storage.copy.*` commands.
