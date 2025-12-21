from django.core.management.base import BaseCommand
from django.db.models import Sum
from workload.models import Athlete, GpsDaily

class Command(BaseCommand):
    help = "過去のGPSデータに基づいて選手のポジション(GK/FP)を自動判定・更新します"

    def handle(self, *args, **options):
        # 判定用閾値（ここを一箇所の定義とする）
        GK_DIVE_LOAD_THRESHOLD = 100

        self.stdout.write("Calculating total dive load per athlete...")

        # 全期間のダイブ負荷を合計してGK候補を抽出
        gk_stats = GpsDaily.objects.values('athlete_id').annotate(total_dive=Sum('total_dive_load'))
        
        # 閾値を超えるIDのセット
        detected_gk_ids = {
            x['athlete_id'] 
            for x in gk_stats 
            if (x['total_dive'] or 0) > GK_DIVE_LOAD_THRESHOLD
        }
        
        self.stdout.write(f"Detected {len(detected_gk_ids)} potential GKs based on threshold > {GK_DIVE_LOAD_THRESHOLD}.")

        # Athleteテーブルの更新処理
        updated_count = 0
        athletes = Athlete.objects.all()
        
        for athlete in athletes:
            current_pos = athlete.position
            new_pos = "GK" if athlete.athlete_id in detected_gk_ids else "FP"
            
            # 変更がある場合のみ保存
            if current_pos != new_pos:
                athlete.position = new_pos
                athlete.save()
                self.stdout.write(f"  [UPDATE] {athlete.athlete_name} ({athlete.athlete_id}): {current_pos} -> {new_pos}")
                updated_count += 1
        
        if updated_count == 0:
            self.stdout.write("No changes needed. All positions are up to date.")
        else:
            self.stdout.write(self.style.SUCCESS(f"Successfully updated positions for {updated_count} athletes."))