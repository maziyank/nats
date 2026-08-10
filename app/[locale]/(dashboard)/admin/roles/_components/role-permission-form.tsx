"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getRole, updateRolePermissions } from "../actions";
import { Loader2, Save } from "lucide-react";
import { register } from "@/services/lib/permissions/registry";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import React from "react";

import { useTranslations } from "next-intl";

export function RolePermissionForm({
  role,
}: {
  role: Awaited<ReturnType<typeof getRole>>;
}) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    role?.permissions || []
  );

  const handleToggle = (permName: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permName)
        ? prev.filter((p) => p !== permName)
        : [...prev, permName]
    );
  };

  const handleSelectAll = (module: string) => {
    const modulePerms = register
      .filter((p) => p.module === module)
      .map((p) => p.name);
    const allSelected = modulePerms.every((p) =>
      selectedPermissions.includes(p)
    );

    if (allSelected) {
      setSelectedPermissions((prev) =>
        prev.filter((p) => !modulePerms.includes(p))
      );
    } else {
      setSelectedPermissions((prev) => [...new Set([...prev, ...modulePerms])]);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (role?.id) {
        await updateRolePermissions(role.id, selectedPermissions);
      }
      router.push("/admin/roles");
      router.refresh();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Group permissions by module
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, typeof register> = {};
    register.forEach((perm) => {
      if (!groups[perm.module]) {
        groups[perm.module] = [];
      }
      groups[perm.module].push(perm);
    });
    return groups;
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              {t("manage_permissions")}
            </h2>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {tCommon("save_changes")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("permissions_registry")}</CardTitle>
          <CardDescription>
            {t("select_permissions_desc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead className="w-[50px]">{t("permission")}</TableHead>
                  <TableHead>{tCommon("description")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(groupedPermissions).map(
                  ([module, perms], index) => (
                    <React.Fragment key={`module-${index}`}>
                      <TableRow className="bg-muted/50 font-medium hover:bg-muted/50">
                        <TableCell>
                          <Checkbox
                            checked={perms.every((p) =>
                              selectedPermissions.includes(p.name)
                            )}
                            onCheckedChange={() => handleSelectAll(module)}
                          />
                        </TableCell>
                        <TableCell
                          colSpan={3}
                          className="uppercase text-xs tracking-wider"
                        >
                          {module}
                        </TableCell>
                      </TableRow>
                      {perms.map((perm) => (
                        <TableRow key={perm.name}>
                          <TableCell>
                            <Checkbox
                              checked={selectedPermissions.includes(perm.name)}
                              onCheckedChange={() => handleToggle(perm.name)}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {perm.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {perm.description}
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  )
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
