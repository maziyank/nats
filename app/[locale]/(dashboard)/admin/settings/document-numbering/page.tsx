import { getTranslations } from "next-intl/server";
import { getDocumentNumberingSettings } from "./actions";
import { SuperJSON } from "@/services/lib/superjson";
import type { DocumentNumbering } from "@/prisma/generated/prisma/client";
import { DocumentNumberingClient } from "./document-numbering-client";
import { PageListContent, PageListHeader, PageListLayout, PageListTitle } from "@/components/layout/page/list-layout";

export default async function DocumentNumberingPage() {
    const t = await getTranslations("DocumentNumbering");
    const response = await getDocumentNumberingSettings();

    if (!response.success) {
        return <div className="p-4 text-destructive">{t("failed_load")}</div>;
    }
    if (!response.data) {
        return <div className="p-4 text-destructive">{t("failed_load")}</div>;
    }

    const settings: DocumentNumbering[] = SuperJSON.deserialize(response.data);

    return (
        <PageListLayout>
            <PageListHeader>
                <PageListTitle title={t("title")} />
            </PageListHeader>
            <PageListContent className="border-0">
                <DocumentNumberingClient data={settings} />
            </PageListContent>
        </PageListLayout>
    );
}
