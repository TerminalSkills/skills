---
name: ms-access
description: >-
  Builds and manages Microsoft Access databases, queries, forms, reports, and VBA
  automation. Use when someone asks to "create Access database", "write Access
  queries", "build Access forms", "Access VBA macro", "migrate from Access",
  "Access report", "link Access to SQL Server", "read an .accdb file", or
  "convert Access to web app". Covers table design, relationships, Access SQL,
  forms, reports, VBA automation, reading .accdb/.mdb files from scripts, and
  migration to SQL Server, Dataverse or an open-source database.
license: Apache-2.0
compatibility: 'Microsoft Access 2021, 2024 or Microsoft 365 on Windows (Access does not run on macOS or Linux). mdbtools reads .mdb/.accdb files on Linux and macOS.'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
    - microsoft-access
    - database
    - vba
    - forms
    - reports
---

# Microsoft Access

## Overview

This skill helps AI agents work with Microsoft Access databases — designing tables, writing queries, building forms and reports, automating with VBA, and planning migrations to modern platforms. Access is widely used in small businesses and departments for data management, and agents should know how to build, maintain, and eventually migrate these systems.

Access itself is a Windows desktop application, so an agent usually writes SQL and VBA for a person to paste in, drives `msaccess.exe` from the command line, or reads the `.accdb` file directly with ODBC (Windows) or mdbtools (Linux, macOS). Supported releases in October 2026 are Access 2024 and Microsoft 365; Access 2016 and 2019 left support on 14 October 2025 and Access 2021 leaves it on 13 October 2026.

## Instructions

### Step 1: Database Design

```
Table: Customers
  CustomerID    AutoNumber (Primary Key)
  FirstName     Short Text (50)
  LastName      Short Text (50)
  Email         Short Text (100), Indexed (No Duplicates)
  Phone         Short Text (20)
  Company       Short Text (100)
  CreatedDate   Date/Time, Default: =Now()
  IsActive      Yes/No, Default: Yes

Table: Orders
  OrderID       AutoNumber (Primary Key)
  CustomerID    Long Integer (Foreign Key -> Customers)
  OrderDate     Date/Time, Default: =Date()
  TotalAmount   Currency
  Status        Short Text (20), Validation: In ("Pending","Shipped","Delivered","Cancelled","Overdue")

Table: OrderItems
  ItemID        AutoNumber (Primary Key)
  OrderID       Long Integer (Foreign Key -> Orders)
  ProductID     Long Integer (Foreign Key -> Products)
  Quantity      Integer, Validation: >0
  UnitPrice     Currency

Table: Products
  ProductID     AutoNumber (Primary Key)
  ProductName   Short Text (100)
  Category      Short Text (50)
  UnitPrice     Currency
  UnitsInStock  Integer, Default: 0
  ReorderLevel  Integer, Default: 10

Relationships (enforce referential integrity, cascade update, no cascade delete):
  Customers (1) --- (many) Orders
  Orders (1) --- (many) OrderItems
  Products (1) --- (many) OrderItems
```

Design rules: AutoNumber PKs, proper data types with length limits, validation rules at table level, default values, indexes on frequently queried fields. Hard limits: 255 fields per table, 255 characters in a Short Text field, 32 indexes per table, 64-character object names.

### Step 2: Queries

```sql
-- Join with aggregation: total sales per customer
SELECT c.CustomerID, c.FirstName & " " & c.LastName AS FullName,
       Count(o.OrderID) AS OrderCount, Sum(o.TotalAmount) AS TotalSpent
FROM Customers c INNER JOIN Orders o ON c.CustomerID = o.CustomerID
GROUP BY c.CustomerID, c.FirstName & " " & c.LastName
HAVING Sum(o.TotalAmount) > 1000
ORDER BY Sum(o.TotalAmount) DESC;

-- Crosstab: monthly sales by category. Three or more tables need nested, parenthesized joins
TRANSFORM Sum(oi.Quantity * oi.UnitPrice) AS Revenue
SELECT p.Category
FROM (Products AS p INNER JOIN OrderItems AS oi ON p.ProductID = oi.ProductID)
INNER JOIN Orders AS o ON oi.OrderID = o.OrderID
WHERE o.OrderDate Between #2026-01-01# And #2026-12-31#
GROUP BY p.Category
PIVOT Format(o.OrderDate, "yyyy-mm");

-- Inactive customers (no orders in 90 days)
SELECT c.CustomerID, c.FirstName, c.LastName, c.Email
FROM Customers c
WHERE c.CustomerID NOT IN (
    SELECT DISTINCT o.CustomerID FROM Orders o WHERE o.OrderDate >= DateAdd("d", -90, Date())
) AND c.IsActive = True;

-- Action: mark overdue orders
UPDATE Orders SET Status = "Overdue"
WHERE Status = "Pending" AND OrderDate < DateAdd("d", -30, Date());

-- Parameter query: declare the types so Access validates the input
PARAMETERS [Enter Start Date:] DateTime, [Enter End Date:] DateTime;
SELECT o.OrderID, c.LastName, o.OrderDate, o.TotalAmount
FROM Orders o INNER JOIN Customers c ON o.CustomerID = c.CustomerID
WHERE o.OrderDate Between [Enter Start Date:] And [Enter End Date:];
```

Access SQL differs from other dialects: `&` concatenates, dates are `#yyyy-mm-dd#` literals, `LIKE` uses `*` and `?` inside Access but `%` and `_` when the same database is queried through ODBC or OLE DB, and an alias cannot be reused in `ORDER BY` or `WHERE` of the same query.

### Step 3: Forms & VBA

```vba
' Search form with dynamic filtering
Private Sub btnSearch_Click()
    Dim strFilter As String
    If Not IsNull(Me.txtSearchName) Then
        ' Double any apostrophe so a name like O'Brien does not break (or rewrite) the filter
        strFilter = "LastName Like '*" & Replace(Me.txtSearchName, "'", "''") & "*'"
    End If
    If Not IsNull(Me.cboStatus) Then
        If Len(strFilter) > 0 Then strFilter = strFilter & " AND "
        strFilter = strFilter & "Status = '" & Replace(Me.cboStatus, "'", "''") & "'"
    End If
    Me.subResults.Form.Filter = strFilter
    Me.subResults.Form.FilterOn = (Len(strFilter) > 0)
End Sub

' Validation before save
Private Sub Form_BeforeUpdate(Cancel As Integer)
    If IsNull(Me.txtEmail) Or Not Me.txtEmail Like "*@*.*" Then
        MsgBox "Please enter a valid email address.", vbExclamation
        Me.txtEmail.SetFocus
        Cancel = True
    End If
End Sub

' Run SQL with user input through a parameterized QueryDef, never by concatenation
Public Function OrdersForCustomer(ByVal lastName As String) As DAO.Recordset
    Dim qdf As DAO.QueryDef
    Set qdf = CurrentDb.CreateQueryDef("", _
        "PARAMETERS pLastName Text(50); " & _
        "SELECT o.OrderID, o.OrderDate, o.TotalAmount FROM Orders AS o " & _
        "INNER JOIN Customers AS c ON o.CustomerID = c.CustomerID WHERE c.LastName = [pLastName]")
    qdf.Parameters("pLastName") = lastName
    Set OrdersForCustomer = qdf.OpenRecordset(dbOpenSnapshot)
End Function
```

### Step 4: Reports & Export

```vba
' Export report to PDF
Private Sub btnExportPDF_Click()
    DoCmd.OutputTo acOutputReport, "rptMonthlySales", acFormatPDF, _
        "C:\Reports\SalesReport_" & Format(Date, "yyyy-mm-dd") & ".pdf"
End Sub

' Export query results to Excel
Public Sub ExportToExcel()
    DoCmd.TransferSpreadsheet acExport, acSpreadsheetTypeExcel12Xml, "qryMonthlySales", _
        "C:\Reports\MonthlySales_" & Format(Date, "yyyy-mm") & ".xlsx", True
End Sub
```

`TransferSpreadsheet` writes the query to a worksheet with a header row and needs no Excel automation. Drive Excel through `CreateObject("Excel.Application")` and `Range.CopyFromRecordset` only when the sheet needs formatting.

### Step 5: Automation

```vba
' Import CSV and deduplicate against existing data
Public Sub ImportCSV()
    ' Link the file instead of copying it into a staging table
    DoCmd.TransferText acLinkDelim, , "lnkImport", "C:\Data\customers-2026-10.csv", True
    CurrentDb.Execute "INSERT INTO Customers (FirstName, LastName, Email) " & _
        "SELECT Trim(FirstName), Trim(LastName), LCase(Trim(Email)) " & _
        "FROM lnkImport WHERE Trim(Email) NOT IN (SELECT Email FROM Customers WHERE Email Is Not Null)", dbFailOnError
    DoCmd.DeleteObject acTable, "lnkImport"   ' removes the link only, the CSV stays
End Sub

' Link to SQL Server with Windows authentication: no password is stored in the database
Public Sub LinkSQLServerTables()
    Dim db As DAO.Database, tdf As DAO.TableDef, connStr As String
    Set db = CurrentDb   ' keep one Database object: a TableDef from a bare CurrentDb call raises error 3420
    connStr = "ODBC;DRIVER={ODBC Driver 18 for SQL Server};SERVER=sqlprod01.northbay.local;" & _
              "DATABASE=Sales;Trusted_Connection=Yes;Encrypt=Yes;"
    Set tdf = db.CreateTableDef("dbo_Customers")
    tdf.Connect = connStr
    tdf.SourceTableName = "dbo.Customers"
    db.TableDefs.Append tdf
End Sub
```

For Azure SQL replace `Trusted_Connection=Yes` with `Authentication=ActiveDirectoryInteractive` and use the `tcp:` server name. ODBC Driver 18 encrypts by default; a server with a self-signed certificate needs a trusted certificate rather than `TrustServerCertificate=Yes` in production.

Unattended runs go through `msaccess.exe` switches placed after the database path: `/x mcrNightlyExport` runs a macro, `/compact` compacts, repairs and exits, `/ro` opens read-only, `/excl` exclusive, `/cmd` (always the last switch) passes a value that VBA reads with `Command()`.

### Step 6: Migration Strategy

| Current | Target | Best For |
|---------|--------|----------|
| Access tables | SQL Server / Azure SQL | Data > 2GB, multi-user |
| Access forms | Power Apps | Low-code, mobile access |
| Access reports | Power BI | Advanced analytics |
| Access + VBA | Web app (Node/Python) | Internet access, APIs |
| Everything | Dataverse + Power Platform | Full MS ecosystem |

- **SQL Server / Azure SQL:** use the free SQL Server Migration Assistant (SSMA) for Access. It converts tables and queries, copies the data, and can leave linked tables behind so existing forms and reports keep working.
- **Dataverse:** right-click a table and choose Export > Dataverse. Sign in to Access with the same account used in Power Apps, and convert floating-point fields to Number with Field Size Decimal first.
- **PostgreSQL, MySQL, SQLite:** export with mdbtools (Step 7). Forms, reports and VBA do not migrate with any of these routes; they have to be rebuilt.

### Step 7: Reading Access Files from Scripts

On Windows, connect through the Access ODBC driver, which ships with Access or the free Access Database Engine redistributable. Python and the driver must have the same bitness.

```python
import pyodbc  # pip install pyodbc
conn = pyodbc.connect(r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=C:\Data\OrderTracker.accdb;")
rows = conn.execute("SELECT LastName, Email FROM Customers WHERE LastName LIKE ?", "Mc%").fetchall()
```

On Linux and macOS there is no Microsoft driver; mdbtools reads the file without Access (read-only):

```bash
sudo apt install mdbtools        # macOS: brew install mdbtools
mdb-ver OrderTracker.accdb       # ACE12 to ACE17 for .accdb (Access 2007 to 2019), JET3/JET4 for .mdb
mdb-tables -1 OrderTracker.accdb                 # one table name per line
mdb-schema OrderTracker.accdb postgres           # DDL; backends include postgres, mysql, sqlite
mdb-export OrderTracker.accdb Customers > customers.csv
mdb-json OrderTracker.accdb Customers            # one JSON object per row
mdb-count OrderTracker.accdb Orders
mdb-queries -1 -L OrderTracker.accdb             # names of saved queries
```

## Examples

### Example 1: Build an order management database
**User prompt:** "Create an Access database for tracking customer orders with products, order items, and a search form to find orders by customer name or date range."

The agent will:
1. Create four tables (Customers, Orders, OrderItems, Products) with AutoNumber primary keys, proper data types, and validation rules
2. Set up relationships with referential integrity: Customers 1-to-many Orders, Orders 1-to-many OrderItems, Products 1-to-many OrderItems
3. Build a search form with text box for customer name, combo box for status, and date range fields
4. Add VBA `btnSearch_Click` handler that constructs a dynamic filter string and applies it to a subform displaying matching orders

Searching for `O'Brien` with status Pending sets the subform filter to `LastName Like '*O''Brien*' AND Status = 'Pending'` and the subform shows only that customer's pending orders.

### Example 2: Generate a monthly sales report and export to PDF
**User prompt:** "Create an Access report showing monthly sales totals grouped by product category, with subtotals per category and a grand total, then export it as a PDF."

The agent will:
1. Write a crosstab query using `TRANSFORM Sum(Quantity * UnitPrice)` pivoted by `Format(OrderDate, "yyyy-mm")` and grouped by product category
2. Design a report with Group Header/Footer on Category (showing subtotals), Detail section for monthly figures, and Report Footer for grand total
3. Add conditional formatting in the group footer's `Format` event to highlight categories with sales under $1,000 in red
4. Implement a `btnExportPDF_Click` handler using `DoCmd.OutputTo` to save the report as a dated PDF file

The crosstab returns one row per category and one column per month (`Category | 2026-01 | 2026-02 | …`); clicking the button on 1 October 2026 writes `C:\Reports\SalesReport_2026-10-01.pdf`.

### Example 3: Move an old .mdb to SQLite on Linux
**User prompt:** "I only have a Linux box. Get the data out of Northwind.mdb into SQLite so I can query it."

```bash
mdb-schema Northwind.mdb sqlite | sqlite3 northwind.sqlite
mdb-tables -1 Northwind.mdb | while IFS= read -r table; do
  mdb-export -I sqlite -b strip Northwind.mdb "$table" | sqlite3 northwind.sqlite
done
mdb-count Northwind.mdb "Order Details"                              # 2155
sqlite3 northwind.sqlite 'SELECT COUNT(*) FROM "Order Details";'     # 2155
sqlite3 -header northwind.sqlite \
  "SELECT Country, COUNT(*) AS customers FROM Customers GROUP BY Country ORDER BY customers DESC LIMIT 3;"
# Country|customers
# USA|13
# Germany|11
# France|11
```

Compare `mdb-count` with the row count in the target for every table before trusting the copy. `-b strip` empties OLE Object columns such as embedded pictures; use `-b hex` to keep them as blobs.

## Guidelines

- Always compact and repair regularly — Access databases bloat over time
- The file limit is 2GB including system objects, and a table cannot exceed it either — plan the migration well before reaching it
- Split database: front-end (forms/queries) on user's machine, back-end (tables) on network share
- Back up .accdb files daily — no built-in replication or point-in-time recovery
- Use parameterized queries, not string concatenation — SQL injection applies to Access too
- Access allows 255 concurrent users on paper, but a shared file on a network drive degrades and corrupts far earlier with many writers; move the tables to SQL Server and link them when several people edit at once
- VBA is disabled until the database is trusted: put the front-end in a Trusted Location or sign the code, and expect files downloaded from the internet to have macros blocked
- Never store SQL Server passwords in a linked table's connection string; use Windows or Microsoft Entra authentication
- Keep VBA in modules, not behind individual forms — easier to maintain and debug
- Error handling in every VBA procedure — `On Error GoTo ErrHandler`
- mdbtools is read-only, and `mdb-queries` reconstructs saved queries approximately (it lists the tables but drops the JOIN conditions) — read the original SQL in Access when it matters
- Document table relationships, validation rules, and VBA in a design document, and plan migration early — Access is a prototyping tool, not an enterprise platform
