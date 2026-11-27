import { db } from "./db";

export type TableInfo = {
  schema: string;
  name: string;
  columns: Map<string, string>; // column -> formatted type, e.g. "uuid", "text[]", "jsonb"
  primaryKey: string[];
};

export type Relation = {
  /** table that holds the foreign key */
  from: string;
  fromColumns: string[];
  /** referenced table */
  to: string;
  toColumns: string[];
  constraint: string;
};

export type FunctionInfo = {
  schema: string;
  name: string;
  argNames: string[];
  argTypes: string[];
  requiredArgs: number;
  returnsSet: boolean;
  returnType: string;
  /** b = base, c = composite, d = domain, e = enum, p = pseudo (void, record), r = range */
  returnKind: string;
  /** true when the function declares OUT/TABLE columns */
  returnsTable: boolean;
};

type Catalog = {
  tables: Map<string, TableInfo>;
  relations: Relation[];
  functions: Map<string, FunctionInfo[]>;
};

let catalog: Promise<Catalog> | undefined;

const key = (schema: string, name: string) => `${schema}.${name}`;

async function load(): Promise<Catalog> {
  const sql = db();
  const columns = await sql.unsafe<
    { schema: string; table: string; column: string; type: string }[]
  >(`
    select n.nspname as schema, c.relname as table, a.attname as column,
           format_type(a.atttypid, a.atttypmod) as type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'storage') and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and a.attnum > 0 and not a.attisdropped
    order by c.relname, a.attnum`);
  const keys = await sql.unsafe<
    {
      contype: string;
      conname: string;
      schema: string;
      table: string;
      cols: string[];
      ref_table: string | null;
      ref_cols: string[] | null;
    }[]
  >(`
    select con.contype, con.conname, n.nspname as schema, c.relname as table,
           array(select a.attname from unnest(con.conkey) with ordinality k(attnum, i)
                 join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
                 order by k.i)::text[] as cols,
           rc.relname as ref_table,
           case when con.contype = 'f' then
             array(select a.attname from unnest(con.confkey) with ordinality k(attnum, i)
                   join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum
                   order by k.i)::text[] end as ref_cols
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_class rc on rc.oid = con.confrelid
    left join pg_namespace rn on rn.oid = rc.relnamespace
    where n.nspname = 'public' and con.contype in ('p', 'f')
      and (con.contype = 'p' or rn.nspname = 'public')`);
  const fns = await sql.unsafe<
    {
      schema: string;
      name: string;
      arg_names: string[] | null;
      arg_types: string[];
      arg_modes: string[] | null;
      nargdefaults: number;
      retset: boolean;
      rettype: string;
      typtype: string;
    }[]
  >(`
    select n.nspname as schema, p.proname as name, p.proargnames::text[] as arg_names,
           array(select format_type(t, null) from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) t)::text[] as arg_types,
           p.proargmodes::text[] as arg_modes,
           p.pronargdefaults as nargdefaults, p.proretset as retset,
           format_type(p.prorettype, null) as rettype, t.typtype::text as typtype
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public' and p.prokind = 'f'`);

  const tables = new Map<string, TableInfo>();
  for (const row of columns) {
    const k = key(row.schema, row.table);
    let info = tables.get(k);
    if (!info) {
      info = {
        schema: row.schema,
        name: row.table,
        columns: new Map(),
        primaryKey: [],
      };
      tables.set(k, info);
    }
    info.columns.set(row.column, row.type);
  }
  const relations: Relation[] = [];
  for (const row of keys) {
    if (row.contype === "p") {
      const info = tables.get(key(row.schema, row.table));
      if (info) info.primaryKey = row.cols;
    } else if (row.ref_table && row.ref_cols) {
      relations.push({
        from: row.table,
        fromColumns: row.cols,
        to: row.ref_table,
        toColumns: row.ref_cols,
        constraint: row.conname,
      });
    }
  }
  const functions = new Map<string, FunctionInfo[]>();
  for (const f of fns) {
    const modes = f.arg_modes ?? f.arg_types.map(() => "i");
    const names = f.arg_names ?? [];
    const inNames: string[] = [];
    const inTypes: string[] = [];
    let hasOut = false;
    modes.forEach((mode, i) => {
      if (mode === "i" || mode === "b" || mode === "v") {
        inNames.push(names[i] ?? "");
        inTypes.push(f.arg_types[i] ?? "unknown");
      } else hasOut = true;
    });
    const info: FunctionInfo = {
      schema: f.schema,
      name: f.name,
      argNames: inNames,
      argTypes: inTypes,
      requiredArgs: inNames.length - f.nargdefaults,
      returnsSet: f.retset,
      returnType: f.rettype,
      returnKind: f.typtype,
      returnsTable: hasOut,
    };
    const list = functions.get(f.name) ?? [];
    list.push(info);
    functions.set(f.name, list);
  }
  return { tables, relations, functions };
}

function current(): Promise<Catalog> {
  if (!catalog) {
    catalog = load().catch((error) => {
      catalog = undefined;
      throw error;
    });
  }
  return catalog;
}

/** Schema changes only happen through migrations, which run before the server starts. */
export function invalidateCatalog(): void {
  catalog = undefined;
}

export async function tableInfo(
  schema: string,
  name: string,
): Promise<TableInfo | undefined> {
  return (await current()).tables.get(key(schema, name));
}

export async function relationsFor(table: string): Promise<Relation[]> {
  return (await current()).relations.filter(
    (r) => r.from === table || r.to === table,
  );
}

export async function functionCandidates(
  name: string,
): Promise<FunctionInfo[]> {
  return (await current()).functions.get(name) ?? [];
}
