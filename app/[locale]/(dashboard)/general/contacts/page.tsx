"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  Search,
  Contact,
} from "lucide-react";
import { ContactDialog } from "./_components/contact-dialog";
import { deleteContact, getContacts } from "./actions";
import { useConfirm } from "@/hooks/use-confirm";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CustomInput } from "@/components/ui/custom-input";
import { Protect } from "@/components/ui/protect";
import { ContactType } from "@/prisma/generated/prisma/browser";
import {
  PageListActions,
  PageListContent,
  PageListFilter,
  PageListHeader,
  PageListLayout,
  PageListTitle,
} from "@/components/layout/page/list-layout";
import { CustomPagination } from "@/components/ui/custom-pagination";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_TYPES_VALUE = "ALL";

type Contact = Awaited<ReturnType<typeof getContacts>>["data"][number];

export default function ContactsPage() {
  const t = useTranslations("General.Contacts");
  const tCommon = useTranslations("Common");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | undefined>(
    undefined
  );
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<ContactType | undefined>(
    undefined
  );
  const [contacts, setContacts] = useState<Contact[]>([]);
  const confirm = useConfirm();

  const handleAddContact = () => {
    setSelectedContact(undefined);
    setIsDialogOpen(true);
  };

  const handleEditContact = (contact: Contact) => {
    setSelectedContact(contact);
    setIsDialogOpen(true);
  };

  const handleDeleteClick = async (contact: Contact) => {
    if (
      await confirm({
        title: t("delete_contact"),
        description: t("delete_confirm_desc", { name: contact.name }),
      })
    ) {
      await deleteContact(contact.id);
    }
  };

  const handleTypeFilterChange = (value: string) => {
    const selectedType =
      value === ALL_TYPES_VALUE ? undefined : (value as ContactType);
    setTypeFilter(selectedType);
    setPage(1);
  };

  useEffect(() => {
    async function fetchData() {
      const data = await getContacts({ page, search, type: typeFilter });
      setContacts(data.data);
      setTotal(data.total);
    }

    fetchData();
  }, [search, page, typeFilter]);

  const getTypeBadgeColor = (type: ContactType) => {
    switch (type) {
      case ContactType.CUSTOMER:
        return "bg-blue-100 text-blue-800 hover:bg-blue-100/80 dark:bg-blue-900 dark:text-blue-300 border-transparent";
      case ContactType.VENDOR:
        return "bg-orange-100 text-orange-800 hover:bg-orange-100/80 dark:bg-orange-900 dark:text-orange-300 border-transparent";
      case ContactType.EMPLOYEE:
        return "bg-purple-100 text-purple-800 hover:bg-purple-100/80 dark:bg-purple-900 dark:text-purple-300 border-transparent";
      default:
        return "bg-gray-100 text-gray-800 hover:bg-gray-100/80 dark:bg-gray-800 dark:text-gray-300 border-transparent";
    }
  };

  const getTypeAvatarColor = (type: ContactType) => {
    switch (type) {
      case ContactType.CUSTOMER:
        return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
      case ContactType.VENDOR:
        return "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300";
      case ContactType.EMPLOYEE:
        return "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  const getTypeLabel = (type: ContactType) => {
    switch (type) {
      case ContactType.CUSTOMER:
        return t("customer");
      case ContactType.VENDOR:
        return t("vendor");
      case ContactType.EMPLOYEE:
        return t("employee");
      default:
        return type;
    }
  };

  return (
    <PageListLayout>
      <PageListHeader>
        <PageListTitle title={t("title")} />
        <PageListActions>
          <Protect permission="contacts.create">
            <Button onClick={handleAddContact}>
              <Plus className="mr-2 h-4 w-4" />
              {t("add_contact")}
            </Button>
          </Protect>
        </PageListActions>
      </PageListHeader>

      <PageListFilter>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <CustomInput
            name="search"
            placeholder={t("search_placeholder")}
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={typeFilter ?? ALL_TYPES_VALUE}
          onValueChange={handleTypeFilterChange}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("all_types")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES_VALUE}>{t("all_types")}</SelectItem>
            <SelectItem value={ContactType.CUSTOMER}>
              {t("customer")}
            </SelectItem>
            <SelectItem value={ContactType.VENDOR}>{t("vendor")}</SelectItem>
            <SelectItem value={ContactType.EMPLOYEE}>
              {t("employee")}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="secondary">
          {tCommon("search")}
        </Button>
      </PageListFilter>

      <PageListContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("type")}</TableHead>
              <TableHead>{t("email")}</TableHead>
              <TableHead>{t("phone")}</TableHead>
              <TableHead>{t("address")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center">
                  {t("no_contacts_found")}
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Avatar size="sm">
                        <AvatarFallback
                          className={getTypeAvatarColor(contact.type)}
                        >
                          {getInitials(contact.name)}
                        </AvatarFallback>
                      </Avatar>
                      <Link
                        href={`/general/contacts/${contact.id}`}
                        className="hover:underline"
                      >
                        {contact.name}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={getTypeBadgeColor(contact.type)}
                      variant="outline"
                    >
                      {getTypeLabel(contact.type)}
                    </Badge>
                  </TableCell>
                  <TableCell>{contact.email || "-"}</TableCell>
                  <TableCell>{contact.phone || "-"}</TableCell>
                  <TableCell>{contact.address || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={contact.isActive ? "default" : "secondary"}>
                      {contact.isActive ? t("active") : t("inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>{tCommon("actions")}</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() =>
                            navigator.clipboard.writeText(contact.id)
                          }
                        >
                          {t("copy_id")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <Protect permission="contacts.edit">
                          <DropdownMenuItem
                            onClick={() => handleEditContact(contact)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {tCommon("edit")}
                          </DropdownMenuItem>
                        </Protect>
                        <Protect permission="contacts.delete">
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(contact)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {tCommon("delete")}
                          </DropdownMenuItem>
                        </Protect>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <CustomPagination
          totalEntries={total || 0}
          pageSize={20}
          currentPage={page}
          onPageChange={setPage}
        />
      </PageListContent>
      <ContactDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        contact={selectedContact}
      />
    </PageListLayout>
  );
}
