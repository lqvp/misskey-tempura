export class NoteDraftSemiPublic1753963970172 {
    name = 'NoteDraftSemiPublic1753963970172'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TYPE "public"."note_draft_visibility_enum" ADD VALUE 'public_non_ltl'`);
    }

    async down(queryRunner) {
        throw new Error(`Downgrading "NoteDraftSemiPublic1753963970172" is not supported automatically due to the complexity of removing a value from a PostgreSQL enum.`);
        //await queryRunner.query(`ALTER TYPE "public"."note_draft_visibility_enum" DROP VALUE 'public_non_ltl'`);
    }
}
