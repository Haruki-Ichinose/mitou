import csv
import hashlib
from datetime import datetime
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from workload.models import DataUpload, Athlete, GpsSessionRaw


def parse_date(value):
    """
    日付パース（よくあるフォーマットを順に試す）
    """
    if not value:
        return None

    value = str(value).strip()
    if not value:
        return None

    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass

    return None


def get_csv_reader_with_encoding(csv_path: Path, sample_size: int = 1024 * 256):
    """
    先頭Nバイトを strict decode できるencodingを選ぶ。
    返り値: (reader, file_obj, encoding)

    ※ 1行だけ読む判定だと utf-8 を誤判定することがあるため、
      先頭の一定バイト数で判定する。
    """
    # 先頭サンプルをバイナリで読む
    sample = csv_path.open("rb").read(sample_size)

    encodings = [
        "utf-8-sig",  # BOMありUTF-8も考慮
        "utf-8",
        "cp932",
        "shift_jis",
        "euc_jp",
        "latin-1",
    ]

    last_error = None

    for enc in encodings:
        try:
            # サンプルを strict decode できるかで判定
            sample.decode(enc, errors="strict")

            # ここまで来たらそのencodingで全体を開く
            file_obj = csv_path.open(newline="", encoding=enc, errors="strict")
            reader = csv.DictReader(file_obj)
            return reader, file_obj, enc

        except Exception as e:
            last_error = e
            continue

    raise CommandError(f"Failed to detect CSV encoding. last_error={last_error}")



class Command(BaseCommand):
    help = "Import StatsAllGroup CSV and store rows as raw GPS sessions"

    def add_arguments(self, parser):
        parser.add_argument(
            "--csv",
            type=str,
            required=True,
            help="Path to StatsAllGroup CSV file",
        )
        parser.add_argument(
            "--user",
            type=str,
            default="",
            help="Uploaded by (optional)",
        )

    def handle(self, *args, **options):
        csv_path = Path(options["csv"])

        if not csv_path.exists():
            raise CommandError(f"CSV not found: {csv_path}")

        # ファイルハッシュ（重複検知用・任意）
        file_hash = hashlib.sha256(csv_path.read_bytes()).hexdigest()

        upload = DataUpload.objects.create(
            source_filename=csv_path.name,
            file_hash=file_hash,
            uploaded_by=options["user"],
            parse_status="pending",
        )

        self.stdout.write(self.style.NOTICE(f"Upload created: id={upload.id}"))

        file_obj = None
        try:
            reader, file_obj, enc = get_csv_reader_with_encoding(csv_path)
            self.stdout.write(self.style.NOTICE(f"CSV encoding detected: {enc}"))

            raw_objects = []
            athletes_cache = {}

            for i, row in enumerate(reader, start=1):
                # ---- athlete_id（列名フォールバック）----
                athlete_id = (
                    row.get("athlete_id")
                    or row.get("AthleteID")
                    or row.get("player_id")
                )
                if not athlete_id:
                    continue
                athlete_id = str(athlete_id).strip()
                if not athlete_id:
                    continue

                athlete = athletes_cache.get(athlete_id)
                if athlete is None:
                    athlete, _ = Athlete.objects.get_or_create(athlete_id=athlete_id)
                    athletes_cache[athlete_id] = athlete

                # ---- date（列名フォールバック）----
                date_value = row.get("date") or row.get("Date") or row.get("session_date")
                date = parse_date(date_value)

                # ---- session name（あれば）----
                session_name = row.get("session_name") or row.get("SessionName") or ""

                raw_objects.append(
                    GpsSessionRaw(
                        upload=upload,
                        row_number=i,
                        athlete=athlete,
                        date=date,
                        session_name=session_name,
                        raw_payload=row,
                    )
                )

            with transaction.atomic():
                GpsSessionRaw.objects.bulk_create(raw_objects, batch_size=1000)

            upload.parse_status = "success"
            upload.save(update_fields=["parse_status"])

            self.stdout.write(
                self.style.SUCCESS(
                    f"Imported {len(raw_objects)} rows into gps_sessions_raw"
                )
            )

        except Exception as e:
            upload.parse_status = "failed"
            upload.error_log = str(e)
            upload.save(update_fields=["parse_status", "error_log"])
            raise

        finally:
            if file_obj:
                file_obj.close()
