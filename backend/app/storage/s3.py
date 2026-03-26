# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Adaptateur de stockage S3 — compatible OVH, AWS, Scaleway, Backblaze, MinIO.

Utilise boto3 pour les opérations S3 standard :
upload, download, delete, test de connexion.
"""

import logging
from io import BytesIO

import boto3
from botocore.exceptions import BotoCoreError, ClientError

_log = logging.getLogger(__name__)


class S3Adapter:
    """Adaptateur de stockage S3-compatible."""

    def __init__(self, credentials: dict):
        self.endpoint = credentials.get("endpoint", "")
        self.access_key = credentials.get("access_key", "")
        self.secret_key = credentials.get("secret_key", "")
        self.bucket = credentials.get("bucket", "")
        self.region = credentials.get("region", "")

        self._client = boto3.client(
            "s3",
            endpoint_url=self.endpoint or None,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region or None,
        )

    def test_connection(self) -> tuple[bool, str]:
        """Teste la connexion S3 en listant le bucket.

        Returns:
            (success, message)
        """
        try:
            self._client.head_bucket(Bucket=self.bucket)
            return True, "Connexion S3 réussie"
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code == "404":
                return False, f"Bucket '{self.bucket}' introuvable"
            if code == "403":
                return False, "Accès refusé — vérifiez les clés d'accès"
            return False, f"Erreur S3 : {e}"
        except BotoCoreError as e:
            return False, f"Erreur de connexion : {e}"
        except Exception as e:
            return False, f"Erreur inattendue : {e}"

    def upload(
        self,
        file_bytes: bytes,
        remote_path: str,
        *,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload un fichier vers S3.

        Args:
            file_bytes: contenu du fichier
            remote_path: chemin dans le bucket (ex: "factures/2026/FA-2026-0001.pdf")
            content_type: MIME type

        Returns:
            URL publique du fichier ou chemin S3
        """
        key = remote_path.lstrip("/")
        try:
            self._client.upload_fileobj(
                BytesIO(file_bytes),
                self.bucket,
                key,
                ExtraArgs={"ContentType": content_type},
            )
            # Construire l'URL
            if self.endpoint:
                url = f"{self.endpoint.rstrip('/')}/{self.bucket}/{key}"
            else:
                url = f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{key}"
            _log.info("S3 upload OK : %s", key)
            return url
        except (ClientError, BotoCoreError) as e:
            _log.error("S3 upload échoué : %s — %s", key, e)
            raise RuntimeError(f"Upload S3 échoué : {e}") from e

    def download(self, remote_path: str) -> bytes:
        """Télécharge un fichier depuis S3.

        Returns:
            contenu du fichier
        """
        key = remote_path.lstrip("/")
        try:
            buf = BytesIO()
            self._client.download_fileobj(self.bucket, key, buf)
            buf.seek(0)
            return buf.read()
        except (ClientError, BotoCoreError) as e:
            _log.error("S3 download échoué : %s — %s", key, e)
            raise RuntimeError(f"Download S3 échoué : {e}") from e

    def delete(self, remote_path: str) -> bool:
        """Supprime un fichier sur S3.

        Returns:
            True si supprimé
        """
        key = remote_path.lstrip("/")
        try:
            self._client.delete_object(Bucket=self.bucket, Key=key)
            _log.info("S3 delete OK : %s", key)
            return True
        except (ClientError, BotoCoreError) as e:
            _log.error("S3 delete échoué : %s — %s", key, e)
            return False

    def generate_presigned_url(self, remote_path: str, expires_in: int = 3600) -> str:
        """Genere une URL presignee pour telecharger un fichier depuis S3.

        Args:
            remote_path: chemin dans le bucket
            expires_in: duree de validite en secondes (defaut 1h)

        Returns:
            URL presignee temporaire
        """
        key = remote_path.lstrip("/")
        try:
            url = self._client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket, 'Key': key},
                ExpiresIn=expires_in,
            )
            return url
        except (ClientError, BotoCoreError) as e:
            _log.error("S3 presigned URL echouee : %s — %s", key, e)
            raise RuntimeError(f"Presigned URL echouee : {e}") from e

    def exists(self, remote_path: str) -> bool:
        """Vérifie l'existence d'un fichier sur S3."""
        key = remote_path.lstrip("/")
        try:
            self._client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError:
            return False
