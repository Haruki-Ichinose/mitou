from django.core.management.base import BaseCommand

from api.services import detect_positions

class Command(BaseCommand):
    help = "過去のGPSデータに基づいて選手のポジション(GK/FP)を自動判定・更新します"

    def handle(self, *args, **options):
        # 判定用閾値（ここを一箇所の定義とする）
        GK_DIVE_LOAD_THRESHOLD = 100

        self.stdout.write("Calculating total dive load per athlete...")
        result = detect_positions(threshold=GK_DIVE_LOAD_THRESHOLD)
        detected_gk_ids = result["detected_gk_ids"]
        updates = result["updates"]

        self.stdout.write(
            f"Detected {len(detected_gk_ids)} potential GKs based on threshold > {GK_DIVE_LOAD_THRESHOLD}."
        )

        if not updates:
            self.stdout.write("No changes needed. All positions are up to date.")
            return

        for update in updates:
            self.stdout.write(
                "  [UPDATE] "
                f"{update['athlete_name']} ({update['athlete_id']}): "
                f"{update['from']} -> {update['to']}"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully updated positions for {len(updates)} athletes."
            )
        )
